import mongoose from 'mongoose';

const mutualFundSchema = new mongoose.Schema({
  name: { type: String, required: true },
  company: { type: String, required: true },
  logo: { type: String },
  type: { type: String, enum: ['Equity', 'Debt', 'Hybrid', 'Liquid'], required: true },
  expectedReturn: { type: Number, required: true },
  previousReturns: [{ year: Number, return: Number }],
  riskLevel: { type: String, enum: ['Low', 'Medium', 'High'] },
  minInvestment: { type: Number },
  lockInPeriod: { type: String },
  symbol: { type: String, required: true },
  addedAt: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.model('MutualFund', mutualFundSchema);
