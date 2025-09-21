import Earning from '../models/Earning.js';
import Referral from '../models/Referral.js';
import ReferralRedemption from '../models/ReferralRedemption.js';
import Payment from '../models/Payment.js';
import Partner from '../models/Partner.js';
import NotificationService from '../services/NotificationService.js';
import WithdrawalRequest from '../models/WithdrawalRequest.js';
import mongoose from 'mongoose';
import { sendInvoiceEmail } from '../utils/emailUtils.js';
import { processReferralCommission } from './referral.js';
import { enqueueReferralSummaryUpdate } from '../services/referralSummaryService.js';
import { getMinRedeemAmount } from '../config/referralConfig.js';
import { recomputeAndPersistPartnerAggregates } from '../utils/partnerAggregates.js';

// Get earnings overview/dashboard data
export const getEarningsOverview = async (req, res) => {
  try {
    const partnerId = req.user.id;
    
  // console.log('Fetching earnings overview for partner:', partnerId);
    
    // Check if partner exists
    const partner = await Partner.findById(partnerId);
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found'
      });
    }

    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();
    
    // Calculate date ranges
    const thisMonthStart = new Date(currentYear, currentMonth, 1);
    const thisMonthEnd = new Date(currentYear, currentMonth + 1, 0);
    const lastMonthStart = new Date(currentYear, currentMonth - 1, 1);
    const lastMonthEnd = new Date(currentYear, currentMonth, 0);
    const thisYearStart = new Date(currentYear, 0, 1);

  // console.log('Date ranges calculated:', { thisMonthStart, thisMonthEnd, lastMonthStart, lastMonthEnd });

    // Get total earnings using simple aggregation instead of static method
  // Include all monetizable statuses so new pending/withdraw earnings reflect immediately
  const totalEarningsResult = await Earning.aggregate([
      {
        $match: {
          partnerId: mongoose.Types.ObjectId.createFromHexString(String(partnerId)),
      status: { $in: ['pending', 'approved', 'withdraw', 'paid'] }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$commissionEarned' },
          count: { $sum: 1 }
        }
      }
    ]);
    
    const totalEarnings = totalEarningsResult[0]?.total || 0;
  // console.log('Total earnings calculated:', totalEarnings);

    // This month earnings
  const thisMonthResult = await Earning.aggregate([
      {
        $match: {
          partnerId: mongoose.Types.ObjectId.createFromHexString(String(partnerId)),
      status: { $in: ['pending', 'approved', 'withdraw', 'paid'] },
          createdAt: { $gte: thisMonthStart, $lte: thisMonthEnd }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$commissionEarned' },
          count: { $sum: 1 }
        }
      }
    ]);
    
    const thisMonthEarnings = thisMonthResult[0]?.total || 0;

    // Last month earnings for comparison
  const lastMonthResult = await Earning.aggregate([
      {
        $match: {
          partnerId: mongoose.Types.ObjectId.createFromHexString(String(partnerId)),
      status: { $in: ['pending', 'approved', 'withdraw', 'paid'] },
          createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$commissionEarned' },
          count: { $sum: 1 }
        }
      }
    ]);
    
    const lastMonthEarnings = lastMonthResult[0]?.total || 0;

    // Calculate growth percentage
    const monthlyGrowth = lastMonthEarnings > 0 
      ? ((thisMonthEarnings - lastMonthEarnings) / lastMonthEarnings * 100).toFixed(2)
      : thisMonthEarnings > 0 ? 100 : 0;

    // Pending earnings
    const pendingEarnings = await Earning.aggregate([
      {
        $match: {
          partnerId: mongoose.Types.ObjectId.createFromHexString(String(partnerId)),
          status: 'pending'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$commissionEarned' },
          count: { $sum: 1 }
        }
      }
    ]);

    const pendingAmount = pendingEarnings[0]?.total || 0;
    const pendingCount = pendingEarnings[0]?.count || 0;
    
    // Approved or currently in withdraw state (awaiting processing) are still "locked" or partially available depending on UX.
    // We'll expose both: available (approved only) and inWithdraw (withdraw status) plus combined.
    const approvedAggregation = await Earning.aggregate([
  { $match: { partnerId: mongoose.Types.ObjectId.createFromHexString(String(partnerId)), status: 'approved' } },
      { $group: { _id: null, total: { $sum: '$commissionEarned' }, count: { $sum: 1 } } }
    ]);
    const withdrawAggregation = await Earning.aggregate([
  { $match: { partnerId: mongoose.Types.ObjectId.createFromHexString(String(partnerId)), status: 'withdraw' } },
      { $group: { _id: null, total: { $sum: '$commissionEarned' }, count: { $sum: 1 } } }
    ]);
    const availableForWithdrawal = approvedAggregation[0]?.total || 0;
    const approvedCount = approvedAggregation[0]?.count || 0;
    const inWithdrawAmount = withdrawAggregation[0]?.total || 0;
    const inWithdrawCount = withdrawAggregation[0]?.count || 0;
    
    // This year monthly breakdown
  const monthlyEarnings = await Earning.aggregate([
      {
        $match: {
          partnerId: mongoose.Types.ObjectId.createFromHexString(String(partnerId)),
      status: { $in: ['pending', 'approved', 'withdraw', 'paid'] },
          createdAt: {
            $gte: new Date(`${currentYear}-01-01`),
            $lte: new Date(`${currentYear}-12-31`)
          }
        }
      },
      {
        $group: {
          _id: { month: { $month: '$createdAt' } },
          total: { $sum: '$commissionEarned' },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.month': 1 }
      }
    ]);
    
    // Format monthly data for charts
    const monthlyData = Array.from({ length: 12 }, (_, index) => {
      const monthData = monthlyEarnings.find(m => m._id.month === index + 1);
      return {
        month: new Date(currentYear, index).toLocaleDateString('en-US', { month: 'short' }),
        amount: monthData?.total || 0,
        leads: monthData?.count || 0
      };
    });

  // console.log('Overview data compiled successfully');

    res.json({
      success: true,
      data: {
        overview: {
          totalEarnings,
          thisMonthEarnings,
          monthlyGrowth: parseFloat(monthlyGrowth),
          pendingAmount,
          pendingCount,
          availableForWithdrawal,
          approvedCount,
          inWithdrawAmount,
          inWithdrawCount,
          commissionRate: partner.commissionRate || 5,
          totalLeads: partner.totalLeads || 0,
          conversionRate: partner.conversionRate || 0
        },
        monthlyData,
        currency: 'INR'
      }
    });
  } catch (error) {
    console.error('Error fetching earnings overview:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch earnings overview',
      error: error.message
    });
  }
};

// POST /api/earnings/email-invoice
export const emailInvoice = async (req, res) => {
  try {
    const partner = await Partner.findById(req.user.id);
    if (!partner) return res.status(404).json({ success: false, message: 'Partner not found' });
  if (!partner.email) return res.status(400).json({ success: false, message: 'Partner email not found' });

    const { fileName, message } = req.body || {};
    const pdfBase64 = req.body?.pdfBase64;
    if (!pdfBase64) return res.status(400).json({ success: false, message: 'Missing PDF data' });

  const pdfBuffer = Buffer.from(pdfBase64, 'base64');
  console.log(`[email-invoice] Partner: ${partner.email}, PDF bytes: ${pdfBuffer.length}, File: ${fileName}`);
    const subject = 'Your Invoice from Zentrocap';
    const greetHtml = message || `<p>Thank you for your continued partnership with Zentrocap. Your invoice is attached for your reference.</p>`;

  const result = await sendInvoiceEmail({
      to: partner.email,
      name: partner.name || 'Partner',
      subject,
      htmlMessage: greetHtml,
      pdfBuffer,
      filename: fileName || 'invoice.pdf'
    });

  if (!result.success) {
      return res.status(500).json({ success: false, message: 'Failed to send invoice email', error: result.error });
    }

  res.json({ success: true, message: 'Invoice email sent', note: result.note, to: partner.email, messageId: result.messageId });
  } catch (err) {
    console.error('Email invoice error:', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// GET /api/earnings/email-invoice/test - send a small test email without attachment
export const testEmailInvoice = async (req, res) => {
  try {
    const partner = await Partner.findById(req.user.id);
    if (!partner) return res.status(404).json({ success: false, message: 'Partner not found' });
    if (!partner.email) return res.status(400).json({ success: false, message: 'Partner email not found' });

    const result = await sendInvoiceEmail({
      to: partner.email,
      name: partner.name || 'Partner',
      subject: 'Zentrocap Test Email',
      htmlMessage: '<p>This is a test email from Zentrocap to verify invoice email delivery.</p>',
      pdfBuffer: Buffer.from('%PDF-1.3\n% Test PDF minimal', 'utf8'),
      filename: 'test.pdf'
    });

    if (!result.success) {
      return res.status(500).json({ success: false, message: 'Failed to send test email', error: result.error });
    }

    res.json({ success: true, message: 'Test email sent', to: partner.email, note: result.note, messageId: result.messageId });
  } catch (err) {
    console.error('Test email error:', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};

// Get detailed earnings list with pagination and filters
export const getEarnings = async (req, res) => {
  try {
    const partnerId = req.user.id;
    const {
      page = 1,
      limit = 10,
      status,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

  // console.log('Fetching earnings for partner:', partnerId, 'with filters:', { status, startDate, endDate });

    // Build filter object
  const filter = { partnerId: mongoose.Types.ObjectId.createFromHexString(String(partnerId)) };
    
    if (status) filter.status = status;
    
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

  // console.log('Filter object:', filter);

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    // Get earnings with pagination
    const earnings = await Earning.find(filter)
      .populate('leadId', 'clientName clientPhone service')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

  // console.log(`Found ${earnings.length} earnings`);

    // Get total count for pagination
    const totalCount = await Earning.countDocuments(filter);
    const totalPages = Math.ceil(totalCount / parseInt(limit));

    res.json({
      success: true,
      data: {
        earnings,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount,
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1
        }
      }
    });
  } catch (error) {
    console.error('Error fetching earnings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch earnings',
      error: error.message
    });
  }
};

// Get payment history
export const getPaymentHistory = async (req, res) => {
  try {
    const partnerId = req.user.id;
    const {
      page = 1,
      limit = 10,
      status,
      paymentMethod,
      startDate,
      endDate
    } = req.query;

  // console.log('Fetching payment history for partner:', partnerId);

    // Build filter object
  const filter = { partnerId: mongoose.Types.ObjectId.createFromHexString(String(partnerId)) };
    
    if (status) filter.status = status;
    if (paymentMethod) filter.paymentMethod = paymentMethod;
    
    if (startDate || endDate) {
      filter.paymentDate = {};
      if (startDate) filter.paymentDate.$gte = new Date(startDate);
      if (endDate) filter.paymentDate.$lte = new Date(endDate);
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get payments with pagination
    const payments = await Payment.find(filter)
      .populate('earningIds', 'commissionEarned description')
      .sort({ paymentDate: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

  // console.log(`Found ${payments.length} payments`);

    // Get total count for pagination
    const totalCount = await Payment.countDocuments(filter);
    const totalPages = Math.ceil(totalCount / parseInt(limit));

    // Calculate summary
    const summary = await Payment.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$status',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        payments,
        summary,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount,
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1
        }
      }
    });
  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment history',
      error: error.message
    });
  }
};

// Get recent transactions (last 10)
export const getRecentTransactions = async (req, res) => {
  try {
    const partnerId = req.user.id;
    
  // console.log('Fetching recent transactions for partner:', partnerId);

    const recentEarnings = await Earning.find({
  partnerId: mongoose.Types.ObjectId.createFromHexString(String(partnerId))
    })
      .populate('leadId', 'clientName service')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

  const withdrawCount = recentEarnings.filter(e => e.status === 'withdraw').length;
  const approvedCountRecent = recentEarnings.filter(e => e.status === 'approved').length;
  // console.log(`Recent earnings fetched: total=${recentEarnings.length} withdraw=${withdrawCount} approved=${approvedCountRecent}`);

  // console.log(`Found ${recentEarnings.length} recent transactions`);

    res.json({
      success: true,
      data: recentEarnings
    });
  } catch (error) {
    console.error('Error fetching recent transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recent transactions',
      error: error.message
    });
  }
};

// Export earnings data (CSV format)
export const exportEarnings = async (req, res) => {
  try {
    const partnerId = req.user.id;
    const { startDate, endDate, format = 'json' } = req.query;

  const filter = { partnerId: mongoose.Types.ObjectId.createFromHexString(String(partnerId)) };
    
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const earnings = await Earning.find(filter)
      .populate('leadId', 'clientName clientPhone service')
      .sort({ createdAt: -1 })
      .lean();

    if (format === 'csv') {
      // Create CSV content
      const csvHeader = 'Date,Amount,Description,Status,Lead Client,Service,Payment Date\n';
      const csvContent = earnings.map(earning => {
        return [
          earning.createdAt.toISOString().split('T')[0],
          earning.commissionEarned,
          `"${earning.description}"`,
          earning.status,
          earning.leadId?.clientName || 'N/A',
          earning.leadId?.service || 'N/A',
          earning.paymentDate ? earning.paymentDate.toISOString().split('T')[0] : 'N/A'
        ].join(',');
      }).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="earnings-${Date.now()}.csv"`);
      res.send(csvHeader + csvContent);
    } else {
      res.json({
        success: true,
        data: earnings,
        exportDate: new Date().toISOString(),
        totalRecords: earnings.length
      });
    }
  } catch (error) {
    console.error('Error exporting earnings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export earnings',
      error: error.message
    });
  }
};

// Create new earning transaction
export const createEarning = async (req, res) => {
  try {
    console.log('🔍 [earnings.js] createEarning called for user:', req.user.id);
    const partnerId = req.user.id;
    const {
      // Client Information
      clientId,
      clientName,
      // Investment Details
      investmentAmount,
      fundName,
      // Commission Details
      commissionRate,
      commissionEarned,
      // Existing fields
      leadId,
      amount,
      commission,
      description,
      status = 'pending'
    } = req.body;

    // Validate required fields
    if (!commissionEarned) {
      return res.status(400).json({
        success: false,
        message: 'Commission earned is required'
      });
    }

    // Validate commission earned is a valid number
    if (isNaN(commissionEarned) || commissionEarned === 0) {
      return res.status(400).json({
        success: false,
        message: 'Commission earned must be a valid number and not zero'
      });
    }

    // Validate status
    const validStatuses = ['pending', 'approved', 'paid', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be one of: ' + validStatuses.join(', ')
      });
    }

    // Verify partner exists
    const partner = await Partner.findById(partnerId);
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found'
      });
    }

    console.log('📊 Partner found:', partner.name);

  // Enforce referral redemption constraints (min redeem and do not exceed available)
    try {
      const isReferralLabel = ['referal earning','referral earning'].includes(String(description || '').toLowerCase()) || ['referal earning','referral earning'].includes(String(fundName || '').toLowerCase());
      const referralId = req.body?.referralId || req.body?.referredReferralId || null;
      const referredPartnerId = req.body?.referredPartnerId || null;
      if (isReferralLabel && referralId && referredPartnerId) {
        const pid = mongoose.Types.ObjectId.createFromHexString(String(partnerId));
        const requestedCount = await ReferralRedemption.countDocuments({ referrerPartnerId: pid, status: 'requested' });
        // Compute conservative availability from referral stats and ledger
        const stats = await Referral.getReferralStats(pid);
        let paid = Number(stats?.paidCommission || 0);
        if (!(paid > 0)) {
          try {
            const refs = await Referral.find({ referrerPartnerId: pid })
              .select('referredPartnerId commissionRate')
              .lean();
            if (refs.length) {
              const refRateMap = refs.reduce((m, r) => { m[String(r.referredPartnerId)] = Number(r.commissionRate || 1); return m; }, {});
              const partnerIds = refs.map(r => mongoose.Types.ObjectId.createFromHexString(String(r.referredPartnerId)));
              const earnings = await mongoose.model('Earning').find({ partnerId: { $in: partnerIds }, status: 'paid' })
                .select('partnerId investmentAmount commissionEarned commissionRate metadata description fundName')
                .lean();
              const investByPartner = {};
              for (const e of earnings) {
                const isReferralEarning = (String(e?.description || '').toLowerCase() === 'referal earning') || (String(e?.fundName || '').toLowerCase() === 'referal earning') || Boolean(e?.metadata?.isReferralRedemption);
                if (isReferralEarning) continue;
                const pid2 = String(e.partnerId);
                const invest = Number(e.investmentAmount || e?.metadata?.baseAmount || 0) || (
                  Number(e.commissionEarned || 0) > 0 && Number(e.commissionRate || 0) > 0
                    ? Math.round((Number(e.commissionEarned) * 100) / Number(e.commissionRate))
                    : 0
                );
                if (!investByPartner[pid2]) investByPartner[pid2] = 0;
                investByPartner[pid2] += invest;
              }
              let computed = 0;
              for (const pidKey of Object.keys(investByPartner)) {
                const rate = refRateMap[pidKey] || 1;
                computed += (investByPartner[pidKey] * rate) / 100;
              }
              if (computed > 0) paid = computed;
            }
          } catch (fbErr) {
            console.warn('⚠️ Fallback compute paid (redeem constraints) failed:', fbErr.message);
          }
        }
        // Sum credited and requested redemptions
        const [creditedRow] = await ReferralRedemption.aggregate([
          { $match: { referrerPartnerId: pid, status: 'credited' } },
          { $group: { _id: null, total: { $sum: { $ifNull: ['$commissionRedeemed', 0] } } } }
        ]);
        const [pendingRow] = await ReferralRedemption.aggregate([
          { $match: { referrerPartnerId: pid, status: 'requested' } },
          { $group: { _id: null, total: { $sum: { $ifNull: ['$commissionRedeemed', 0] } } } }
        ]);
        const redeemedCredited = Number(creditedRow?.total || 0);
        const pendingRedemption = Number(pendingRow?.total || 0);
        const availableAfterPending = Math.max(0, paid - redeemedCredited - pendingRedemption);
        const MIN_REDEEM = getMinRedeemAmount();
        if (requestedCount === 0 && availableAfterPending < MIN_REDEEM) {
          return res.status(400).json({ success: false, message: `Minimum redeem amount is ₹${MIN_REDEEM}. Available ₹${availableAfterPending}` });
        }
        // Hard cap: do not allow redemption above current available; clamp to available
        const requestedCommission = Number(req.body?.commissionEarned || commissionEarned || 0);
        if (requestedCommission > availableAfterPending) {
          req.body.commissionEarned = availableAfterPending; // clamp for downstream use
        }
      }
    } catch (minErr) {
      console.warn('⚠️ Redeem constraints check failed (non-fatal):', minErr?.message);
      // Continue; do not block creation on precheck error
    }

    // Calculate commission if not provided
    let finalCommission = commission;
    if (!finalCommission && partner.commissionRate) {
      finalCommission = (commissionEarned * partner.commissionRate) / 100;
    }

    // Create earning record
  const newEarning = new Earning({
  partnerId: mongoose.Types.ObjectId.createFromHexString(String(partnerId)),
      // Client Information
      clientId: clientId || null,
      clientName: clientName || null,
      // Investment Details
  // If this is a referral redemption (we detect later), force investmentAmount null
  investmentAmount: investmentAmount ? Number(investmentAmount) : null,
      fundName: fundName || null,
      // Commission Details
      commissionRate: commissionRate ? Number(commissionRate) : null,
  commissionEarned: Number(req.body?.commissionEarned ?? commissionEarned),
      // Existing fields
  leadId: leadId ? mongoose.Types.ObjectId.createFromHexString(String(leadId)) : null,
      commission: finalCommission || 0,
      description: description || 'Commission earning',
      status,
      createdAt: new Date(),
      updatedAt: new Date()
    });

  const savedEarning = await newEarning.save();
  // Update partner aggregates (fire & forget)
  recomputeAndPersistPartnerAggregates(savedEarning.partnerId).catch(err => console.warn('aggregate recompute (create earning) failed:', err.message));
    console.log('💰 Earning created successfully:', savedEarning._id);

    // If this earning represents a referral redemption, persist a ledger entry
    try {
  const meta = req.body || {};
      const referralId = meta.referralId || meta.referredReferralId || null;
      const referredPartnerId = meta.referredPartnerId || null;
  const isReferalLabel = ['Referal Earning','Referral Earning'].includes(String(newEarning?.description || '')) || ['Referal Earning','Referral Earning'].includes(String(newEarning?.fundName || ''));
  if (isReferalLabel && referralId && referredPartnerId) {
        // Force investment amount null for referral redemption earning (not tied to an explicit investment)
        if (newEarning.investmentAmount !== null) {
          newEarning.investmentAmount = null;
          try { await newEarning.save(); } catch {}
        }
        // Validate referral belongs to this partner and referred partner
        const referral = await Referral.findOne({
          _id: mongoose.Types.ObjectId.createFromHexString(String(referralId)),
          referrerPartnerId: mongoose.Types.ObjectId.createFromHexString(String(partnerId)),
          referredPartnerId: mongoose.Types.ObjectId.createFromHexString(String(referredPartnerId))
        }).select('_id');
        if (referral) {
          await ReferralRedemption.findOneAndUpdate(
            { earningId: savedEarning._id },
            {
              referrerPartnerId: mongoose.Types.ObjectId.createFromHexString(String(partnerId)),
              referralId: referral._id,
              referredPartnerId: mongoose.Types.ObjectId.createFromHexString(String(referredPartnerId)),
              earningId: savedEarning._id,
              commissionRedeemed: Number(newEarning.commissionEarned || 0),
              investmentAmount: newEarning.investmentAmount || null,
              commissionRate: newEarning.commissionRate || null,
      isReferralRedemption: true,
              notes: 'Redeemed via Refer & Earn'
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
        }
      }
    } catch (ledgerErr) {
      console.error('⚠️ Failed to record referral redemption ledger:', ledgerErr.message);
    }

    // If earning is already paid on creation, process referral commission for referrer
    try {
  const isReferralRedemption = ['Referal Earning','Referral Earning'].includes(String(newEarning?.description || '')) || ['Referal Earning','Referral Earning'].includes(String(newEarning?.fundName || ''));
      if (!isReferralRedemption && status === 'paid') {
  const invest = Number(newEarning.investmentAmount || newEarning?.metadata?.baseAmount || 0) || (
          Number(newEarning.commissionEarned || 0) > 0 && Number(newEarning.commissionRate || 0) > 0
            ? Math.round((Number(newEarning.commissionEarned) * 100) / Number(newEarning.commissionRate))
            : 0
        );
        if (invest > 0) {
          await processReferralCommission(String(savedEarning.partnerId), invest);
        }
      }
    } catch (rcErr) {
      console.error('⚠️ Failed to process referral commission on createEarning:', rcErr.message);
    }

    // Populate the response
    const populatedEarning = await Earning.findById(savedEarning._id)
      .populate('leadId', 'clientName clientPhone service')
      .populate('partnerId', 'name email');

    res.status(201).json({
      success: true,
      message: 'Earning created successfully',
      data: populatedEarning
    });

  } catch (error) {
    console.error('❌ Error creating earning:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create earning',
      error: error.message
    });
  }
};

// Process payment for earnings
export const processPayment = async (req, res) => {
  try {
    console.log('🔍 [earnings.js] processPayment called for user:', req.user.id);
    const partnerId = req.user.id; // May be an admin (not an ObjectId) when initiating payment
    const {
      // New logic: we expect a withdrawalRequestId referencing an approved withdrawal
      withdrawalRequestId,
      paymentMethod = 'bank_transfer',
      paymentReference,
      notes
    } = req.body;
    // Validate withdrawal request id
    if (!withdrawalRequestId) {
      return res.status(400).json({
        success: false,
        message: 'withdrawalRequestId is required'
      });
    }

    // Validate payment method (updated list consistent with WithdrawalRequest model)
    const validMethods = ['bank_transfer', 'upi', 'paytm', 'phonepe', 'google_pay', 'internet_banking'];
    if (!validMethods.includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment method. Must be one of: ' + validMethods.join(', ')
      });
    }

    // Load withdrawal request by id (admin can act on any, partner only own)
    let withdrawalObjectId;
    try {
      withdrawalObjectId = new mongoose.Types.ObjectId(String(withdrawalRequestId));
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid withdrawalRequestId' });
    }
    let withdrawal = await WithdrawalRequest.findById(withdrawalObjectId);
    if (!withdrawal) {
      return res.status(404).json({ success: false, message: 'Withdrawal request not found' });
    }
    if (req.user.role !== 'admin' && String(withdrawal.partnerId) !== String(partnerId)) {
      return res.status(403).json({ success: false, message: 'Not authorized to process this withdrawal request' });
    }
    // Auto-promote requested -> approved so admin can immediately process
    if (withdrawal.status === 'requested') {
      withdrawal.status = 'approved';
      await withdrawal.save();
    }
    if (withdrawal.status !== 'approved') {
      return res.status(400).json({ success: false, message: `Withdrawal must be in approved state to process (current: ${withdrawal.status})` });
    }

  // Load earnings associated with this withdrawal request (should currently have status 'withdraw')
  const earnings = await Earning.find({ _id: { $in: withdrawal.earningIds } });
    if (!earnings.length) {
      return res.status(400).json({
        success: false,
        message: 'No earnings linked to this withdrawal request'
      });
    }

    console.log('📊 Processing payment for withdrawal request:', withdrawal._id, 'earnings count:', earnings.length);

    const totalAmount = earnings.reduce((sum, earning) => sum + earning.commissionEarned, 0);
    const totalCommission = earnings.reduce((sum, earning) => sum + (earning.commission || 0), 0);

    // Create / or ensure payment record in processing state (do not mark earnings paid yet)
    const newPayment = new Payment({
      partnerId: withdrawal.partnerId, // real partner ObjectId
      earningIds: earnings.map(e => e._id),
      amount: totalAmount,
      commission: totalCommission,
      paymentMethod,
      paymentReference: paymentReference || `PAY-${Date.now()}`,
      status: 'processing',
      notes,
      createdAt: new Date(),
      processedAt: new Date()
    });

    const savedPayment = await newPayment.save();
    console.log('💳 Payment record created:', savedPayment._id);

    // Do not mark earnings as paid yet (they remain in withdraw until completion)
    console.log('⏳ Earnings kept in withdraw status until completion');

    // Referral redemption crediting deferred until completion step

  // Update withdrawal request to processing (InProcess UI)
  withdrawal.status = 'processing';
  withdrawal.processedAt = new Date();
    withdrawal.metadata = withdrawal.metadata || {};
    withdrawal.metadata.paymentId = newPayment._id;
    withdrawal.paymentId = newPayment._id; // ensure direct reference for later updates
    await withdrawal.save();
  console.log('✅ Withdrawal request moved to processing');

    // Populate the response
    const populatedPayment = await Payment.findById(savedPayment._id)
      .populate('partnerId', 'name email')
      .populate('earningIds', 'amount type description createdAt');

    // Create a notification that payment processing has started (so user sees immediate feedback)
    try {
      console.log('🔔 Creating initial payment processing notification for partner:', withdrawal.partnerId);
      await NotificationService.createPaymentNotification(withdrawal.partnerId, {
        _id: populatedPayment._id,
        amount: populatedPayment.amount,
        paymentMethod: populatedPayment.paymentMethod,
        status: populatedPayment.status || 'processing',
        transactionId: populatedPayment.transactionId
      });
      console.log('✅ Initial payment processing notification created');
    } catch (notifyErr) {
      console.error('⚠️ Failed to create processing notification (non-fatal):', notifyErr.message);
    }

    res.status(201).json({
      success: true,
      message: 'Payment initiated successfully',
      data: {
        payment: populatedPayment,
        earningsCount: earnings.length,
        totalAmount,
        totalCommission,
        withdrawalRequestId: withdrawal._id
      }
    });

  } catch (error) {
    console.error('❌ Error processing payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process payment',
      error: error.message
    });
  }
};

// Update earning status
export const updateEarningStatus = async (req, res) => {
  try {
    console.log('🔍 [earnings.js] updateEarningStatus called for user:', req.user.id);
    const partnerId = req.user.id;
    const { earningId } = req.params;
    const { status, notes } = req.body;

    // Validate status
    const validStatuses = ['pending', 'approved', 'paid', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be one of: ' + validStatuses.join(', ')
      });
    }

    // Find and update the earning
    const earning = await Earning.findOneAndUpdate(
      { 
  _id: new mongoose.Types.ObjectId(String(earningId)),
  partnerId: new mongoose.Types.ObjectId(String(partnerId))
      },
      { 
        status,
        notes: notes || null,
        updatedAt: new Date(),
        ...(status === 'paid' && { paymentDate: new Date() })
      },
      { new: true }
    ).populate('leadId', 'clientName clientPhone service');

    if (!earning) {
      return res.status(404).json({
        success: false,
        message: 'Earning not found or you do not have permission to update it'
      });
    }

    console.log('✅ Earning status updated:', earning._id, 'to', status);

    // If earning transitioned to paid, process referral commission for referrer
    try {
      if (status === 'paid') {
        // If this earning is a referral redemption, mark the ledger as credited
        try {
          const isReferralRedemption = ['Referal Earning','Referral Earning'].includes(String(earning?.description || '')) || ['Referal Earning','Referral Earning'].includes(String(earning?.fundName || '')) || Boolean(earning?.metadata?.isReferralRedemption);
          if (isReferralRedemption) {
        const rr = await ReferralRedemption.findOneAndUpdate(
          { earningId: mongoose.Types.ObjectId.createFromHexString(String(earning._id)) },
              { status: 'credited', creditedAt: new Date() },
              { new: true }
            );
            if (rr) enqueueReferralSummaryUpdate?.(rr.referrerPartnerId);
          }
        } catch (rrErr) {
          console.warn('⚠️ Failed to credit ReferralRedemption on earning paid:', rrErr.message);
        }
        // Skip referral commission propagation for referral redemption entries
  const dlc = String(earning?.description || '').toLowerCase();
  const flc = String(earning?.fundName || '').toLowerCase();
  const isReferralRedemptionForCommission = (dlc === 'referal earning' || dlc === 'referral earning') || (flc === 'referal earning' || flc === 'referral earning') || Boolean(earning?.metadata?.isReferralRedemption);
        if (isReferralRedemptionForCommission) {
          // Do not process upline commission for referral redemptions
        } else {
  const invest = Number(earning.investmentAmount || earning?.metadata?.baseAmount || 0) || (
          Number(earning.commissionEarned || 0) > 0 && Number(earning.commissionRate || 0) > 0
            ? Math.round((Number(earning.commissionEarned) * 100) / Number(earning.commissionRate))
            : 0
        );
        if (invest > 0) {
          await processReferralCommission(String(earning.partnerId), invest);
        }
        }
      }
    } catch (rcErr) {
      console.error('⚠️ Failed to process referral commission on updateEarningStatus:', rcErr.message);
    }

    // Recompute aggregates if status impacts totals
    if (status === 'paid' || status === 'approved') {
      recomputeAndPersistPartnerAggregates(earning.partnerId).catch(err => console.warn('aggregate recompute (update earning status) failed:', err.message));
    }
    res.json({
      success: true,
      message: 'Earning status updated successfully',
      data: earning
    });

  } catch (error) {
    console.error('❌ Error updating earning status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update earning status',
      error: error.message
    });
  }
};

// Update payment status
export const updatePaymentStatus = async (req, res) => {
  try {
    console.log('='.repeat(80));
    console.log('🔍 [earnings.js] updatePaymentStatus called');
    console.log('🔍 Request method:', req.method);
    console.log('🔍 Request URL:', req.originalUrl);
    console.log('🔍 Request headers authorization:', req.headers.authorization ? 'Present' : 'Missing');
    console.log('🔍 User object:', { id: req.user?.id, _id: req.user?._id, email: req.user?.email });
    
    const partnerId = req.user._id || req.user.id;
    const { paymentId } = req.params;
  const { status, notes, transactionId, clearTransactionId } = req.body;

    console.log('🔍 Payment update params:', { partnerId, paymentId, status });
    console.log('🔍 Request body:', JSON.stringify(req.body, null, 2));

    // Validate status
    const validStatuses = ['pending', 'processing', 'completed', 'failed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be one of: ' + validStatuses.join(', ')
      });
    }

    // Build update document carefully to avoid duplicate key on transactionId=null
    const updateDoc = {
      status,
      notes: notes || null,
      updatedAt: new Date()
    };

    // Only set transactionId if provided or if completing without one (auto-generate)
    if (clearTransactionId) {
      updateDoc.$unset = { transactionId: 1 }; // explicitly remove field
    } else if (transactionId) {
      updateDoc.transactionId = transactionId;
    } else if (status === 'completed') {
      // Auto-generate if moving to completed and no transactionId supplied
      updateDoc.transactionId = `TXN${Date.now()}${Math.random().toString(36).substr(2,5)}`.toUpperCase();
    }

    if (status === 'completed') {
      updateDoc.paymentDate = new Date();
      updateDoc.processedAt = new Date();
    }

    const payment = await Payment.findOneAndUpdate(
      {
  _id: new mongoose.Types.ObjectId(String(paymentId)),
  partnerId: new mongoose.Types.ObjectId(String(partnerId))
      },
      updateDoc,
      { new: true }
    )
    .populate('partnerId', 'name email')
    .populate('earningIds', 'amount type description status');

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found or you do not have permission to update it'
      });
    }

    console.log('✅ Payment status updated:', payment._id, 'to', status);

    // If payment is completed, ensure related earnings are marked as paid
    if (status === 'completed') {
      await Earning.updateMany(
        { _id: { $in: payment.earningIds.map(e => e._id) } },
        { 
          status: 'paid',
          paymentDate: new Date(),
          updatedAt: new Date()
        }
      );
      console.log('✅ Updated related earnings to paid status');

      // Process referral commissions for each paid earning
      try {
        const refreshedEarnings = await Earning.find({ _id: { $in: payment.earningIds.map(e => e._id) } }).lean();
        // Credit any referral redemption ledgers tied to these earnings
        try {
          const rrList = await ReferralRedemption.find({ earningId: { $in: refreshedEarnings.map(e => e._id) } }).lean();
          if (rrList.length) {
            await ReferralRedemption.updateMany(
              { earningId: { $in: rrList.map(r => r.earningId) } },
              { status: 'credited', creditedAt: new Date() }
            );
            const uniqueReferrers = [...new Set(rrList.map(r => String(r.referrerPartnerId)))] ;
            try { uniqueReferrers.forEach(id => enqueueReferralSummaryUpdate?.(id)); } catch {}
            console.log(`✅ Credited ${rrList.length} referral redemptions (payment completed)`);
          }
        } catch (rrErr) {
          console.warn('⚠️ Failed to credit referral redemptions on payment completion:', rrErr.message);
        }
        for (const e of refreshedEarnings) {
          const dlc2 = String(e?.description || '').toLowerCase();
          const flc2 = String(e?.fundName || '').toLowerCase();
          const isReferralRedemptionForCommission = (dlc2 === 'referal earning' || dlc2 === 'referral earning') || (flc2 === 'referal earning' || flc2 === 'referral earning') || Boolean(e?.metadata?.isReferralRedemption);
          if (isReferralRedemptionForCommission) {
            // Skip upline commission for referral redemption entries
            continue;
          }
          const invest = Number(e.investmentAmount || e?.metadata?.baseAmount || 0) || (
            Number(e.commissionEarned || 0) > 0 && Number(e.commissionRate || 0) > 0
              ? Math.round((Number(e.commissionEarned) * 100) / Number(e.commissionRate))
              : 0
          );
          if (invest > 0) {
            await processReferralCommission(String(e.partnerId), invest);
          }
        }
      } catch (rcErr) {
        console.error('⚠️ Failed to process referral commissions on payment completion:', rcErr.message);
      }

      // Create payment processed notification
      try {
        console.log('='.repeat(50));
        console.log('🔔 NOTIFICATION SECTION - Payment completed');
        console.log('🔔 Creating payment notification for partner:', partnerId);
        console.log('🔔 Partner type:', typeof partnerId, 'ObjectId valid:', mongoose.Types.ObjectId.isValid(partnerId));
        console.log('🔔 Payment data:', {
          id: payment._id,
          amount: payment.amount,
          status: payment.status,
          transactionId: payment.transactionId,
          paymentMethod: payment.paymentMethod
        });
        
        console.log('🔔 Calling NotificationService.createPaymentNotification...');
        const result = await NotificationService.createPaymentNotification(
          new mongoose.Types.ObjectId(partnerId),
          payment
        );
        console.log('🔔 Notification creation result:', result);
        console.log('✅ Payment processed notification created successfully');
        console.log('='.repeat(50));
      } catch (notificationError) {
        console.error('='.repeat(50));
        console.error('⚠️ ERROR CREATING PAYMENT NOTIFICATION');
        console.error('⚠️ Error:', notificationError.message);
        console.error('⚠️ Stack:', notificationError.stack);
        console.error('⚠️ Notification error details:', {
          partnerId,
          paymentId: payment._id,
          status: payment.status
        });
        console.error('='.repeat(50));
        // Don't fail the payment update if notification fails
      }
    }

    res.json({
      success: true,
      message: 'Payment status updated successfully',
      data: payment
    });

    console.log('='.repeat(80));
    console.log('✅ Payment status update completed successfully');
    console.log('✅ Response sent to client');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('='.repeat(80));
    console.error('❌ ERROR UPDATING PAYMENT STATUS');
    console.error('❌ Error message:', error.message);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Request details:', {
      method: req.method,
      url: req.originalUrl,
      params: req.params,
      body: req.body,
      userId: req.user?.id || req.user?._id
    });
    console.error('='.repeat(80));
    
    res.status(500).json({
      success: false,
      message: 'Failed to update payment status',
      error: error.message
    });
  }
};
