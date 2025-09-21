import Earning from '../models/Earning.js';
import Payment from '../models/Payment.js';
import mongoose from 'mongoose';

// Minimum withdrawal threshold in INR
const MIN_WITHDRAWAL_AMOUNT = 500;

// POST /api/earnings/withdraw
export const requestWithdrawal = async (req, res) => {
  try {
    const partnerId = req.user.id;

    // Find all approved (unpaid) earnings
    const earnings = await Earning.find({
      partnerId: new mongoose.Types.ObjectId(partnerId),
      status: 'approved'
    }).sort({ createdAt: 1 });

    if (!earnings.length) {
      return res.status(400).json({
        success: false,
        message: 'No approved earnings available for withdrawal'
      });
    }

    const totalAvailable = earnings.reduce((sum, e) => sum + e.commissionEarned, 0);

    if (totalAvailable < MIN_WITHDRAWAL_AMOUNT) {
      return res.status(400).json({
        success: false,
        message: `Minimum withdrawal amount is ₹${MIN_WITHDRAWAL_AMOUNT}. Available balance is ₹${totalAvailable}.`
      });
    }

    // Create a payment record in processing/pending state
    const payment = new Payment({
      partnerId: new mongoose.Types.ObjectId(partnerId),
      earningIds: earnings.map(e => e._id),
      amount: totalAvailable,
      paymentMethod: 'bank_transfer', // default, can later be customized
      status: 'processing',
      notes: 'Withdrawal request initiated by partner',
      createdAt: new Date(),
      processedAt: new Date()
    });

    await payment.save();

    // Mark included earnings as paid (or optionally keep as approved until admin completes) -> here we'll mark as paid
    await Earning.updateMany(
      { _id: { $in: earnings.map(e => e._id) } },
      { status: 'paid', paymentDate: new Date(), updatedAt: new Date() }
    );

    return res.status(201).json({
      success: true,
      message: 'Withdrawal request submitted successfully',
      data: {
        paymentId: payment._id,
        amount: totalAvailable,
        earningsCount: earnings.length
      }
    });
  } catch (error) {
    console.error('Error requesting withdrawal:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process withdrawal request',
      error: error.message
    });
  }
};

export default { requestWithdrawal };
