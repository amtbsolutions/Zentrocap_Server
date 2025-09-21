import mongoose from 'mongoose';

const partnerReferralSummarySchema = new mongoose.Schema({
  partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', unique: true },
  // Totals derived from events/ledger
  paidCommission: { type: Number, default: 0 },
  pendingCommission: { type: Number, default: 0 },
  redeemedCredited: { type: Number, default: 0 },
  pendingRedemption: { type: Number, default: 0 },
  availableBalance: { type: Number, default: 0 }, // paidCommission - redeemedCredited
  // Referral stats
  totalReferrals: { type: Number, default: 0 },
  activeReferrals: { type: Number, default: 0 },
  pendingReferrals: { type: Number, default: 0 },
  totalInvestmentAmount: { type: Number, default: 0 },
  totalCommissionEarned: { type: Number, default: 0 },
  lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true });

// Unique index on partnerId is already created via the schema path above; no need to add a duplicate index.

const PartnerReferralSummary = mongoose.model('PartnerReferralSummary', partnerReferralSummarySchema);
export default PartnerReferralSummary;
