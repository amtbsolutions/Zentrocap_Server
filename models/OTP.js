import mongoose from 'mongoose';

const OTPSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true,
    match: [
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      'Please add a valid email'
    ]
  },
  otp: {
    type: String,
    required: [true, 'OTP is required'],
    length: 6
  },
  purpose: {
    type: String,
    required: true,
    enum: ['registration', 'password-reset', 'email-change', 'login'],
    default: 'registration'
  },
  verified: {
    type: Boolean,
    default: false
  },
  attempts: {
    type: Number,
    default: 0,
    max: 5
  },
  expiresAt: {
    type: Date,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  verifiedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Index for efficient querying
OTPSchema.index({ email: 1, purpose: 1 });
OTPSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Method to check if OTP is expired
OTPSchema.methods.isExpired = function() {
  return new Date() > this.expiresAt;
};

// Method to check if OTP attempts exceeded
OTPSchema.methods.attemptsExceeded = function() {
  return this.attempts >= 5;
};

// Static method to find valid OTP
OTPSchema.statics.findValidOTP = async function(email, otp, purpose = 'registration') {
  return await this.findOne({
    email,
    otp,
    purpose,
    verified: false,
    attempts: { $lt: 5 },
    expiresAt: { $gt: new Date() } // Not expired
  });
};

// Static method to clean expired OTPs
OTPSchema.statics.cleanExpired = async function() {
  const result = await this.deleteMany({
    expiresAt: { $lt: new Date() }
  });
  // Quiet by default
  return result.deletedCount;
};

export default mongoose.model('OTP', OTPSchema);
