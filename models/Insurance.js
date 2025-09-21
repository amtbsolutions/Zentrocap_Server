import mongoose from 'mongoose';

const insuranceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  company: { type: String, required: true },
  logo: { type: String },
  type: { type: String, enum: ['Life', 'Health', 'Vehicle', 'Travel', 'Other'], required: true },
  coverageAmount: { type: Number },
  premium: { type: Number },
  expectedReturn: { type: Number },
  policyTerm: { type: String },
  claimRatio: { type: Number },
  addedAt: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.model('Insurance', insuranceSchema);
