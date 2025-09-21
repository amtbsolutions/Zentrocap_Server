import mongoose from 'mongoose';

const earningSchema = new mongoose.Schema({
  partnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Partner',
    required: true
  },
  // Client Information
  clientId: {
    type: String,
    required: false
  },
  clientName: {
    type: String,
    required: false
  },
  // Investment Details
  investmentAmount: {
    type: Number,
    required: false
  },
  fundName: {
    type: String,
    required: false
  },
  // Commission Details
  commissionRate: {
    type: Number,
    required: false // percentage value like 2.5
  },
  commissionEarned: {
    type: Number,
    required: true // This replaces the amount field
  },
  description: {
    type: String,
    required: true
  },
  leadId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lead',
    required: false
  },
  status: {
    type: String,
  enum: ['pending', 'approved', 'withdraw', 'paid', 'cancelled'],
    default: 'pending'
  },
  paymentDate: {
    type: Date,
    required: false
  },
  paymentMethod: {
    type: String,
    enum: ['bank_transfer', 'upi', 'paytm', 'phonepe', 'google_pay', 'internet_banking', 'cheque', 'cash'],
    required: false
  },
  transactionId: {
    type: String,
    required: false
  },
  metadata: {
    commissionRate: Number,
    baseAmount: Number,
    bonusMultiplier: Number,
    notes: String
  }
}, {
  timestamps: true
});

// Index for efficient queries
earningSchema.index({ partnerId: 1, createdAt: -1 });
earningSchema.index({ status: 1 });
earningSchema.index({ paymentDate: 1 });

// Virtual for formatted amount
earningSchema.virtual('formattedAmount').get(function() {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR'
  }).format(this.amount);
});

// Methods
earningSchema.methods.markAsPaid = function(paymentDetails) {
  this.status = 'paid';
  this.paymentDate = paymentDetails.paymentDate || new Date();
  this.paymentMethod = paymentDetails.paymentMethod;
  this.transactionId = paymentDetails.transactionId;
  return this.save();
};

// Static methods for aggregations
earningSchema.statics.getTotalEarnings = function(partnerId, startDate, endDate) {
  const match = { 
    partnerId: new mongoose.Types.ObjectId(partnerId),
    status: { $in: ['approved', 'paid'] }
  };
  
  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) match.createdAt.$gte = new Date(startDate);
    if (endDate) match.createdAt.$lte = new Date(endDate);
  }
  
  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        total: { $sum: '$amount' },
        count: { $sum: 1 },
        byType: {
          $push: {
            type: '$type',
            amount: '$amount'
          }
        }
      }
    }
  ]);
};

earningSchema.statics.getMonthlyEarnings = function(partnerId, year = new Date().getFullYear()) {
  return this.aggregate([
    {
      $match: {
        partnerId: new mongoose.Types.ObjectId(partnerId),
        status: { $in: ['approved', 'paid'] },
        createdAt: {
          $gte: new Date(`${year}-01-01`),
          $lte: new Date(`${year}-12-31`)
        }
      }
    },
    {
      $group: {
        _id: { month: { $month: '$createdAt' } },
        total: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { '_id.month': 1 }
    }
  ]);
};

const Earning = mongoose.model('Earning', earningSchema);

export default Earning;
