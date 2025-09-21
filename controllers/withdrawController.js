import Earning from '../models/Earning.js';
import WithdrawalRequest from '../models/WithdrawalRequest.js';
import Payment from '../models/Payment.js';
import Partner from '../models/Partner.js';
import ReferralRedemption from '../models/ReferralRedemption.js';
import mongoose from 'mongoose';

const MIN_WITHDRAWAL_AMOUNT = 500;

// Partner initiates withdrawal
export const createWithdrawalRequest = async (req, res) => {
  try {
    const partnerId = req.user.id;

    // Ensure payment preferences are configured before allowing withdrawal
    try {
      const partner = await Partner.findById(partnerId).select('preferredPaymentMethod upiId bankDetails');
      if (!partner) return res.status(404).json({ success: false, message: 'Partner not found' });
      const method = partner.preferredPaymentMethod;
      let valid = false;
      if (method === 'upi') {
        valid = Boolean(partner.upiId && partner.upiId.trim().length >= 6);
      } else if (method === 'internet-banking') {
        const b = partner.bankDetails || {};
        valid = Boolean(b.accountNumber && b.ifscCode && b.bankName);
      } else if (method) {
        // For wallet-like methods treat similarly to UPI
        valid = Boolean(partner.upiId && partner.upiId.trim().length >= 6);
      }
      if (!valid) {
        return res.status(400).json({ success: false, message: 'Configure your payment preference (UPI or Bank details) before requesting withdrawal' });
      }
    } catch (prefErr) {
      console.warn('Payment preference validation failed:', prefErr.message);
      return res.status(500).json({ success: false, message: 'Unable to validate payment preferences' });
    }

    // Fetch approved earnings not already in withdraw/paid
    const earnings = await Earning.find({
      partnerId: new mongoose.Types.ObjectId(partnerId),
      status: 'approved'
    }).sort({ createdAt: 1 });

    if (!earnings.length) {
      return res.status(400).json({ success: false, message: 'No approved earnings available for withdrawal' });
    }

    const total = earnings.reduce((sum, e) => sum + e.commissionEarned, 0);
    if (total < MIN_WITHDRAWAL_AMOUNT) {
      return res.status(400).json({ success: false, message: `Minimum withdrawal is ₹${MIN_WITHDRAWAL_AMOUNT}. Available ₹${total}` });
    }

    // Mark earnings as withdraw (NEW status) but do NOT mark paid
    await Earning.updateMany({ _id: { $in: earnings.map(e => e._id) } }, { status: 'withdraw', updatedAt: new Date() });

    const request = await WithdrawalRequest.create({
      partnerId: new mongoose.Types.ObjectId(partnerId),
      earningIds: earnings.map(e => e._id),
      amount: total,
      status: 'requested',
      metadata: {
        snapshot: { earningCount: earnings.length }
      }
    });

    return res.status(201).json({ success: true, message: 'Withdrawal request created', data: { requestId: request._id, amount: total, earnings: earnings.length } });
  } catch (err) {
    console.error('Error creating withdrawal request:', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Admin processes (approve -> processing -> completed) - here we expose endpoints; assume admin auth middleware later
export const updateWithdrawalStatus = async (req, res) => {
  try {
    const { id } = req.params;
  const { status, notes, paymentMethod, transactionId } = req.body;
    // Support extended admin UI statuses: Requested, Approved, InProcess, Completed, Failed, Rejected
    const uiToInternal = {
      Requested: 'requested',
      Approved: 'approved',
      InProcess: 'processing', // now map directly to processing
      Completed: 'completed',
      Failed: 'failed',
      Rejected: 'cancelled'
    };
    const internal = uiToInternal[status] || status; // allow direct internal usage
  const valid = ['requested', 'approved', 'processing', 'completed', 'failed', 'cancelled'];
    if (!valid.includes(internal)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const request = await WithdrawalRequest.findById(id);
    if (!request) return res.status(404).json({ success: false, message: 'Withdrawal request not found' });
    // Backfill paymentId if stored in metadata only
    if (!request.paymentId && request.metadata?.paymentId) {
      request.paymentId = request.metadata.paymentId;
    }

  request.status = internal;
    if (notes) request.adminNotes = notes;
    if (paymentMethod) request.paymentMethod = paymentMethod;
    if (transactionId) request.transactionId = transactionId;
    if (internal === 'completed') request.processedAt = new Date();
    await request.save();

    // Transition logic
    if (internal === 'approved') {
      // No earning status change yet; admin just approved
    } else if (internal === 'processing') {
      // Ensure a Payment exists in processing
      if (!request.paymentId) {
        const payment = await Payment.create({
          partnerId: request.partnerId,
          earningIds: request.earningIds,
          amount: request.amount,
          paymentMethod: paymentMethod || 'bank_transfer',
          status: 'processing'
        });
        request.paymentId = payment._id;
        await request.save();
      } else if (paymentMethod) {
        await Payment.updateOne({ _id: request.paymentId }, { paymentMethod });
      }
    } else if (internal === 'completed') {
      // Mark earnings as paid and finalize payment
      await Earning.updateMany({ _id: { $in: request.earningIds } }, { status: 'paid', paymentDate: new Date(), updatedAt: new Date() });
      if (request.paymentId) {
        await Payment.updateOne({ _id: request.paymentId }, {
          status: 'completed',
          transactionId: transactionId || undefined,
          paymentDate: new Date()
        });
      } else {
        const payment = await Payment.create({
          partnerId: request.partnerId,
          earningIds: request.earningIds,
          amount: request.amount,
          paymentMethod: paymentMethod || 'bank_transfer',
          status: 'completed',
          transactionId: transactionId || undefined,
          paymentDate: new Date()
        });
        request.paymentId = payment._id;
        await request.save();
      }
      // Credit referral redemption ledgers (moved from processPayment)
      try {
        const rrList = await ReferralRedemption.find({ earningId: { $in: request.earningIds } }).select('_id referrerPartnerId earningId status').lean();
        if (rrList.length) {
          await ReferralRedemption.updateMany({ earningId: { $in: rrList.map(r => r.earningId) } }, { status: 'credited', creditedAt: new Date() });
          const uniqueReferrers = [...new Set(rrList.map(r => String(r.referrerPartnerId)))] ;
          try { uniqueReferrers.forEach(id => enqueueReferralSummaryUpdate?.(id)); } catch {}
          console.log(`✅ Credited ${rrList.length} referral redemption ledgers on completion`);
        }
      } catch (rrErr) {
        console.warn('⚠️ Failed to credit referral redemptions on completion:', rrErr.message);
      }
    } else if (internal === 'failed') {
      // Payment failed: update payment status & revert earnings to approved so they can be re-withdrawn
      if (request.paymentId) {
        await Payment.updateOne({ _id: request.paymentId }, {
          status: 'failed',
          adminNotes: notes || 'Payment failed'
        });
      }
      await Earning.updateMany({ _id: { $in: request.earningIds } }, { status: 'approved', updatedAt: new Date() });
      request.status = 'failed';
      await request.save();
    } else if (internal === 'cancelled') {
      // Cancelled (rejected) before completion: revert earnings to approved
      await Earning.updateMany({ _id: { $in: request.earningIds } }, { status: 'approved', updatedAt: new Date() });
    }

    return res.json({ success: true, message: 'Withdrawal status updated', data: request });
  } catch (err) {
    console.error('Error updating withdrawal status:', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Partner view own requests
export const listMyWithdrawals = async (req, res) => {
  try {
    const partnerId = req.user.id;
    const requests = await WithdrawalRequest.find({ partnerId }).sort({ createdAt: -1 }).limit(50).lean();
    return res.json({ success: true, data: requests });
  } catch (err) {
    console.error('Error listing withdrawals:', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Admin list all withdrawal requests with partner info and optional filters
export const listAllWithdrawals = async (req, res) => {
  try {
    // Filters: status, partner search, date range
    const { status, q, startDate, endDate, limit = 100 } = req.query;
    const find = {};
    if (status && status !== 'All') {
      const uiToInternal = { Requested: 'requested', Approved: 'approved', InProcess: 'approved', Completed: 'completed', Failed: 'cancelled', Rejected: 'cancelled' };
      find.status = uiToInternal[status] || status;
    }
    if (startDate || endDate) {
      find.createdAt = {};
      if (startDate) find.createdAt.$gte = new Date(startDate);
      if (endDate) find.createdAt.$lte = new Date(endDate);
    }
    const lim = Math.min(Number(limit) || 100, 500);
    const requests = await WithdrawalRequest.find(find)
      .sort({ createdAt: -1 })
      .limit(lim)
      .populate('partnerId', 'name email mobile companyName gstNumber preferredPaymentMethod upiId bankDetails');
    let filtered = requests;
    if (q) {
      const needle = q.toLowerCase();
      filtered = requests.filter(r => [r._id, r.partnerId?.name, r.partnerId?.email, r.partnerId?.mobile, r.partnerId?.companyName, r.partnerId?.gstNumber]
        .some(v => String(v || '').toLowerCase().includes(needle)));
    }
    const enriched = filtered.map(r => {
      const p = r.partnerId || {};
      let paymentDetails = null;
      if (p.preferredPaymentMethod === 'upi') {
        paymentDetails = { method: 'UPI', upiId: p.upiId || '' };
      } else if (p.preferredPaymentMethod) {
        paymentDetails = {
          method: 'Bank',
          accountHolderName: p.bankDetails?.accountHolderName || '',
          accountNumber: p.bankDetails?.accountNumber || '',
          ifscCode: p.bankDetails?.ifscCode || '',
          bankName: p.bankDetails?.bankName || ''
        };
      }
      // Attach derived details (do not mutate original mongoose doc for safety)
      return {
        ...r.toObject(),
        derivedPaymentDetails: paymentDetails
      };
    });
    const totalAmount = enriched.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    res.json({ success: true, data: enriched, total: enriched.length, totalAmount });
  } catch (err) {
    console.error('Error listing all withdrawals:', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

export default { createWithdrawalRequest, updateWithdrawalStatus, listMyWithdrawals, listAllWithdrawals };
