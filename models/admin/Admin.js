import mongoose from 'mongoose';

const adminSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  mobile: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  otp: { type: String },
  otpExpiry: { type: Date },
  isVerified: { type: Boolean, default: false },
  isApproved: { type: Boolean, default: false },
  isSuspended: { type: Boolean, default: false },
}, { timestamps: true });

export default mongoose.model('Admin', adminSchema);
