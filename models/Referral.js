import mongoose from 'mongoose';

const referralSchema = new mongoose.Schema({
  referrerPartnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Partner',
    required: true
  },
  referredPartnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Partner',
    required: true
  },
  referralCode: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'inactive'],
    default: 'pending'
  },
  referredPartnerEmail: {
    type: String,
    required: true
  },
  referredPartnerName: {
    type: String,
    required: true
  },
  registrationDate: {
    type: Date,
    default: Date.now
  },
  firstInvestmentDate: {
    type: Date
  },
  commissionRate: {
    type: Number,
    default: 1, // 1% commission rate
    min: 0,
    max: 100
  },
  lastActivityDate: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
referralSchema.index({ referrerPartnerId: 1, status: 1 });
referralSchema.index({ referredPartnerId: 1 });
referralSchema.index({ referralCode: 1 });
referralSchema.index({ referralCode: 1, referredPartnerId: 1 });

// Legacy helpers removed (commissionPayments and totals deprecated)

// Static method to find referrals by referrer
referralSchema.statics.findByReferrer = function(referrerPartnerId, options = {}) {
  const query = { referrerPartnerId: new mongoose.Types.ObjectId(referrerPartnerId) };
  
  if (options.status) {
    query.status = options.status;
  }
  
  return this.find(query)
    .populate('referredPartnerId', 'name email phone registrationDate')
    .populate('referrerPartnerId', 'name email')
    .sort({ createdAt: -1 });
};

// Static method to get referral stats
referralSchema.statics.getReferralStats = async function(referrerPartnerId) {
  const referrals = await this.find({ referrerPartnerId: new mongoose.Types.ObjectId(referrerPartnerId) }).select('status');
  return {
    totalReferrals: referrals.length,
    activeReferrals: referrals.filter(r => r.status === 'active').length,
    pendingReferrals: referrals.filter(r => r.status === 'pending').length,
    // numeric totals deprecated in model; real totals computed from Earnings elsewhere
    totalInvestmentAmount: 0,
    totalCommissionEarned: 0,
    pendingCommission: 0,
    paidCommission: 0
  };
};

const Referral = mongoose.model('Referral', referralSchema);

export default Referral;
