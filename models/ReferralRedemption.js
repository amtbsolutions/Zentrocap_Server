import mongoose from 'mongoose';

const referralRedemptionSchema = new mongoose.Schema({
  referrerPartnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true },
  referralId: { type: mongoose.Schema.Types.ObjectId, ref: 'Referral', required: true },
  referredPartnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true },
  earningId: { type: mongoose.Schema.Types.ObjectId, ref: 'Earning', required: true },
  commissionRedeemed: { type: Number, required: true },
  investmentAmount: { type: Number },
  commissionRate: { type: Number },
  isReferralRedemption: { type: Boolean, default: true },
  notes: { type: String },
  // payout tracking
  status: { type: String, enum: ['requested', 'credited', 'failed'], default: 'requested' },
  creditedAt: { type: Date },
  transactionRef: { type: String }
}, { timestamps: true });

referralRedemptionSchema.index({ referrerPartnerId: 1, createdAt: -1 });
referralRedemptionSchema.index({ referralId: 1 });
referralRedemptionSchema.index({ earningId: 1 }, { unique: true });
referralRedemptionSchema.index({ referrerPartnerId: 1, status: 1, createdAt: -1 });

const ReferralRedemption = mongoose.model('ReferralRedemption', referralRedemptionSchema);

export default ReferralRedemption;
