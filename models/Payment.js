import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
  partnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Partner',
    required: true
  },
  earningIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Earning'
  }],
  amount: {
    type: Number,
    required: true
  },
  paymentMethod: {
    type: String,
    enum: ['bank_transfer', 'upi', 'paytm', 'phonepe', 'google_pay', 'internet_banking', 'cheque', 'cash'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  transactionId: {
    type: String,
    unique: true,
    sparse: true
  },
  bankDetails: {
    accountNumber: String,
    ifscCode: String,
    bankName: String,
    accountHolderName: String
  },
  upiDetails: {
    upiId: String,
    upiApp: String
  },
  chequeDetails: {
    chequeNumber: String,
    bankName: String,
    issuedDate: Date
  },
  paymentDate: {
    type: Date,
    default: Date.now
  },
  processedDate: {
    type: Date
  },
  notes: {
    type: String
  },
  adminNotes: {
    type: String
  },
  taxDeduction: {
    tdsAmount: {
      type: Number,
      default: 0
    },
    tdsPercentage: {
      type: Number,
      default: 0
    },
    panNumber: String
  }
}, {
  timestamps: true
});

// Index for efficient queries
paymentSchema.index({ partnerId: 1, paymentDate: -1 });
paymentSchema.index({ status: 1 });
// paymentSchema.index({ transactionId: 1 }); // Removed duplicate index, unique is set in schema

// Virtual for net amount after tax deduction
paymentSchema.virtual('netAmount').get(function() {
  return this.amount - (this.taxDeduction?.tdsAmount || 0);
});

// Virtual for formatted amount
paymentSchema.virtual('formattedAmount').get(function() {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR'
  }).format(this.amount);
});

// Virtual for formatted net amount
paymentSchema.virtual('formattedNetAmount').get(function() {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR'
  }).format(this.netAmount);
});

// Methods
paymentSchema.methods.markAsCompleted = function(transactionId, processedDate = new Date()) {
  this.status = 'completed';
  this.transactionId = transactionId;
  this.processedDate = processedDate;
  return this.save();
};

paymentSchema.methods.markAsFailed = function(reason) {
  this.status = 'failed';
  this.adminNotes = reason;
  return this.save();
};

// Pre-save middleware to generate transaction ID
paymentSchema.pre('save', function(next) {
  if (!this.transactionId && this.status !== 'pending') {
    this.transactionId = `TXN${Date.now()}${Math.random().toString(36).substr(2, 5)}`.toUpperCase();
  }
  next();
});

const Payment = mongoose.model('Payment', paymentSchema);

export default Payment;
