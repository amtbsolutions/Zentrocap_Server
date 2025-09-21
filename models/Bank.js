import mongoose from 'mongoose';

const bankSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  logo: { type: String },
  type: { type: String, enum: ['Public', 'Private', 'Foreign'], required: true },
  establishedYear: { type: Number },
  branches: { type: Number },
  country: { type: String },
  contact: {
    email: { type: String },
    phone: { type: String },
    website: { type: String }
  },
  addedAt: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.model('Bank', bankSchema);
