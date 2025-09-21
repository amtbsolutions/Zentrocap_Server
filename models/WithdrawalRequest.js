import mongoose from 'mongoose';

const withdrawalRequestSchema = new mongoose.Schema({
  partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true },
  earningIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Earning', required: true }],
  amount: { type: Number, required: true },
  status: { 
    type: String, 
    enum: ['requested', 'approved', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'requested'
  },
  requestedAt: { type: Date, default: Date.now },
  processedAt: { type: Date },
  paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
  notes: String,
  adminNotes: String,
  paymentMethod: { type: String, enum: ['bank_transfer', 'upi', 'paytm', 'phonepe', 'google_pay', 'internet_banking'], default: 'bank_transfer' },
  transactionId: { type: String },
  metadata: {
    snapshot: Object // can hold snapshot of partner stats at request time
  }
}, { timestamps: true });

withdrawalRequestSchema.index({ partnerId: 1, createdAt: -1 });
withdrawalRequestSchema.index({ status: 1 });

const WithdrawalRequest = mongoose.model('WithdrawalRequest', withdrawalRequestSchema);
export default WithdrawalRequest;
