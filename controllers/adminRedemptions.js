import mongoose from 'mongoose';
import ReferralRedemption from '../models/ReferralRedemption.js';
import { enqueueReferralSummaryUpdate } from '../services/referralSummaryService.js';

export const listPendingRedemptions = async (req, res) => {
  try {
    const { limit = 20, cursor } = req.query;
    const q = { status: 'requested' };
    if (cursor) {
      q._id = { $lt: new mongoose.Types.ObjectId(String(cursor)) };
    }
    const rows = await ReferralRedemption.find(q)
      .sort({ _id: -1 })
      .limit(parseInt(limit))
      .lean();
    const nextCursor = rows.length === parseInt(limit) ? rows[rows.length - 1]._id : null;
    res.json({ success: true, data: { items: rows, nextCursor } });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to list pending redemptions', error: e.message });
  }
};

export const markRedemptionCredited = async (req, res) => {
  try {
    const { id } = req.params;
    const { transactionRef, creditedAt } = req.body;
    const doc = await ReferralRedemption.findById(id);
    if (!doc) return res.status(404).json({ success: false, message: 'Redemption not found' });
    doc.status = 'credited';
    if (transactionRef) doc.transactionRef = transactionRef;
    doc.creditedAt = creditedAt ? new Date(creditedAt) : new Date();
    await doc.save();
    enqueueReferralSummaryUpdate(doc.referrerPartnerId);
    res.json({ success: true, data: doc });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to credit redemption', error: e.message });
  }
};

export const markRedemptionFailed = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const doc = await ReferralRedemption.findById(id);
    if (!doc) return res.status(404).json({ success: false, message: 'Redemption not found' });
    doc.status = 'failed';
    if (reason) doc.failureReason = reason;
    await doc.save();
    enqueueReferralSummaryUpdate(doc.referrerPartnerId);
    res.json({ success: true, data: doc });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to fail redemption', error: e.message });
  }
};
