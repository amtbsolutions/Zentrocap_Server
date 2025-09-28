import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const PartnerSchema = new mongoose.Schema({
  // Basic Information
  name: {
    type: String,
    required: [true, 'Please provide name'],
    minlength: 2,
    maxlength: 100
  },
  email: {
    type: String,
    required: [true, 'Please provide email'],
    unique: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email'
    ]
  },
  phone: {
    type: String,
    required: [true, 'Please provide phone number'],
    match: [/^[0-9]{10}$/, 'Please provide a valid 10-digit phone number']
  },
  password: {
    type: String,
    required: [true, 'Please provide password'],
    minlength: 6,
    select: false
  },
  
  // Company Information
  entityType: {
    type: String,
    enum: ['individual', 'company'],
    default: 'individual'
  },
  companyName: {
    type: String,
    maxlength: 200,
    default: ''
  },
  designation: {
    type: String,
    maxlength: 100
  },
  companyAddress: {
    type: String,
    maxlength: 500
  },
  gstNumber: {
    type: String,
    maxlength: 15,
    trim: true,
    match: [/^$|^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{1}Z[A-Z0-9]{1}$/,'Please provide a valid 15-character GST number'],
    default: null
  },
  // Address for Individual account type
  address: {
    type: String,
    maxlength: 500,
    default: ''
  },
  city: {
    type: String,
    required: [true, 'Please provide city'],
    maxlength: 50
  },
  state: {
    type: String,
    required: [true, 'Please provide state'],
    maxlength: 50
  },
  pincode: {
    type: String,
    match: [/^[0-9]{6}$/, 'Please provide a valid 6-digit pincode']
  },
  
  // Document Information
  aadhaarNumber: {
    type: String,
    required: [true, 'Please provide Aadhaar number'],
    match: [/^[0-9]{12}$/, 'Please provide a valid 12-digit Aadhaar number']
  },
  panNumber: {
    type: String,
    required: [true, 'Please provide PAN number'],
    match: [/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Please provide a valid PAN number']
  },
  aadhaarFile: {
    type: String, // File URL
    default: null
  },
  aadhaarFileMetadata: {
    originalName: String,
    mimetype: String,
    size: Number,
    extension: String
  },
  panFile: {
    type: String, // File URL  
    default: null
  },
  panFileMetadata: {
    originalName: String,
    mimetype: String,
    size: Number,
    extension: String
  },
  // Other documents uploaded during signup (stored on partner, not global Document collection)
  otherDocuments: [{
    gridfsId: { type: mongoose.Schema.Types.ObjectId, required: true },
    documentType: {
      type: String,
      enum: ['general', 'aadhaar', 'pan', 'business', 'certificate', 'bank-statement', 'other', 'policy', 'compliance', 'marketing', 'training'],
      default: 'general'
    },
    originalName: { type: String },
    filename: { type: String },
    mimetype: { type: String },
    size: { type: Number },
    fileUrl: { type: String },
    previewUrl: { type: String },
    uploadedAt: { type: Date, default: Date.now },
    notes: { type: String }
  }],
  
  // Additional Information
  experience: {
    type: String,
    enum: ['0-1', '1-3', '3-5', '5-10', '10+', ''],
    default: ''
  },
  specialization: {
    type: String,
    enum: ['mutual-funds', 'insurance', 'loans', 'investment', 'tax-planning', 'retirement', ''],
    default: ''
  },
  referralCode: {
    type: String,
    unique: true,
    sparse: true,
    maxlength: 50
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Partner',
    default: null
  },
  referredByCode: {
    type: String,
    default: null
  },
  
  // Payment Preferences
  preferredPaymentMethod: {
    type: String,
    enum: ['upi', 'paytm', 'phonepe', 'google-pay', 'internet-banking'],
    default: 'upi'
  },
  upiId: {
    type: String,
    default: ''
  },
  bankDetails: {
    accountNumber: {
      type: String,
      default: ''
    },
    accountHolderName: {
      type: String,
      default: ''
    },
    ifscCode: {
      type: String,
      default: ''
    },
    bankName: {
      type: String,
      default: ''
    }
  },
  
  // System fields
  role: {
    type: String,
    enum: ['partner', 'admin', 'superadmin'],
    default: 'partner'
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'suspended'],
    default: 'pending'
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  emailVerifiedAt: {
    type: Date,
    default: null
  },
  approvedAt: {
    type: Date,
    default: null
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  // Earnings and Performance
  totalEarnings: {
    type: Number,
    default: 0
  },
  totalLeads: {
    type: Number,
    default: 0
  },
  conversionRate: {
    type: Number,
    default: 0
  },
  
  // Related data
  leads: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lead'
  }],
  transactions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction'
  }]
}, { 
  timestamps: true 
});

// Create indexes
// PartnerSchema.index({ email: 1 }); // Removed duplicate index, unique is set in schema
PartnerSchema.index({ phone: 1 });
PartnerSchema.index({ aadhaarNumber: 1 });
PartnerSchema.index({ panNumber: 1 });
PartnerSchema.index({ status: 1 });

// Encrypt password before saving and generate referral code
PartnerSchema.pre('save', async function(next) {
  // Hash password if modified
  if (this.isModified('password')) {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
  }
  
  // Generate unique referral code if not exists
  if (this.isNew && !this.referralCode) {
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;
    
    while (!isUnique && attempts < maxAttempts) {
      // Generate referral code: PART + first 3 letters of name + 4 random digits
      const namePrefix = this.name.replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase();
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const candidateCode = `PART${namePrefix}${randomSuffix}`;
      
      // Check if code already exists
      const existingPartner = await mongoose.model('Partner').findOne({ referralCode: candidateCode });
      if (!existingPartner) {
        this.referralCode = candidateCode;
        isUnique = true;
      }
      attempts++;
    }
    
    // Fallback: use timestamp if all attempts failed
    if (!isUnique) {
      this.referralCode = `PART${Date.now()}`;
    }
  }
  
  next();
});

// Compare password
PartnerSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Generate JWT Token
PartnerSchema.methods.getSignedJwtToken = function() {
  return jwt.sign({ 
    id: this._id, 
    role: this.role, 
    type: 'partner' 
  }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE
  });
};

export default mongoose.model('Partner', PartnerSchema);
