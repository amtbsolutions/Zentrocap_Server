import mongoose from 'mongoose';

const LeadSchema = new mongoose.Schema({
  // Basic Information
  name: {
    type: String,
    required: [true, 'Please provide lead name'],
    minlength: 2,
    maxlength: 100,
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Please provide email'],
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email'
    ],
    trim: true,
    lowercase: true
  },
  phone: {
    type: String,
    required: [true, 'Please provide phone number'],
    match: [/^[0-9]{10}$/, 'Please provide a valid 10-digit phone number']
  },
  
  // Lead Details
  leadSource: {
    type: String,
    required: [true, 'Please provide lead source'],
    enum: [
      'Website Form',
      'Social Media',
      'Referral',
      'Cold Call',
      'Email Campaign',
      'Partner Referral',
      'Advertisement',
      'Trade Show',
      'Other'
    ]
  },
  
  leadType: {
    type: String,
    required: [true, 'Please provide lead type'],
    enum: [
      'Individual',
      'Corporate',
      'SME',
      'Enterprise'
    ],
    default: 'Individual'
  },
  
  status: {
    type: String,
    required: true,
    enum: [
      'New',
      'Contacted',
      'Qualified',
      'Proposal Sent',
      'Negotiation',
      'Converted',
      'Lost',
      'On Hold'
    ],
    default: 'New'
  },
  
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Urgent'],
    default: 'Medium'
  },
  
  // Contact Information
  company: {
    type: String,
    maxlength: 100,
    trim: true
  },
  
  designation: {
    type: String,
    maxlength: 50,
    trim: true
  },
  
  // Address
  address: {
    type: String,
    maxlength: 200,
    trim: true
  },
  
  city: {
    type: String,
    maxlength: 50,
    trim: true
  },
  
  state: {
    type: String,
    maxlength: 50,
    trim: true
  },
  
  pincode: {
    type: String,
    match: [/^[0-9]{6}$/, 'Please provide a valid 6-digit pincode']
  },
  
  // Business Information
  interestedProducts: [{
    type: String,
    enum: [
      'Mutual Funds',
      'Insurance',
      'Fixed Deposits',
      'Equity Trading',
      'Bonds',
      'Tax Planning',
      'Retirement Planning',
      'Wealth Management',
      'Other'
    ]
  }],
  
  estimatedInvestment: {
    type: Number,
    min: 0,
    default: 0
  },
  
  investmentTimeframe: {
    type: String,
    enum: [
      'Immediate',
      'Within 1 Month',
      'Within 3 Months',
      'Within 6 Months',
      'Within 1 Year',
      'Within 2 Years',
      'Within 3 Years',
      'Within 4 Years',
      'Within 5 Years',
      'Not Decided'
    ]
  },
  
  // Assignment
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Partner'
  },
  
  assignedPartner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Partner'
  },

  // Admin Assignment Tracking
  assignedByAdmin: {
    type: Boolean,
    default: false
  },
  
  adminAssignedBy: {
    type: String, // Admin email or ID from admin-dashboard
    default: null
  },
  
  adminAssignedAt: {
    type: Date,
    default: null
  },
  
  adminAssignmentNote: {
    type: String,
    maxlength: 500,
    default: ''
  },

  // Interaction History
  notes: [{
    content: {
      type: String,
      required: true,
      maxlength: 1000
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Partner',
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Communication Log
  communications: [{
    type: {
      type: String,
      enum: ['Call', 'Email', 'Meeting', 'WhatsApp', 'SMS', 'Other'],
      required: true
    },
    subject: {
      type: String,
      maxlength: 200
    },
    description: {
      type: String,
      maxlength: 1000
    },
    outcome: {
      type: String,
      enum: ['Positive', 'Neutral', 'Negative', 'No Response'],
      default: 'Neutral'
    },
    nextFollowUp: {
      type: Date
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Partner',
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Important Dates
  lastContactDate: {
    type: Date
  },
  
  nextFollowUpDate: {
    type: Date
  },
  
  closedDate: {
    type: Date
  },
  
  // Lead Scoring
  leadScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  
  // Conversion Data
  convertedToClient: {
    type: Boolean,
    default: false
  },
  
  conversionValue: {
    type: Number,
    min: 0,
    default: 0
  },
  
  // System Fields
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Partner'
  },
  
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Partner'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
  collection: 'partnerleads'
});

// Indexes for better performance
LeadSchema.index({ email: 1 });
LeadSchema.index({ phone: 1 });
LeadSchema.index({ status: 1 });
LeadSchema.index({ assignedTo: 1 });
LeadSchema.index({ assignedPartner: 1 });
LeadSchema.index({ leadSource: 1 });
LeadSchema.index({ priority: 1 });
LeadSchema.index({ nextFollowUpDate: 1 });
LeadSchema.index({ createdAt: -1 });

// Virtual for days since created
LeadSchema.virtual('daysSinceCreated').get(function() {
  return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24));
});

// Virtual for days since last contact
LeadSchema.virtual('daysSinceLastContact').get(function() {
  if (!this.lastContactDate) return null;
  return Math.floor((Date.now() - this.lastContactDate) / (1000 * 60 * 60 * 24));
});

// Pre-save middleware to update lastContactDate when communications are added
LeadSchema.pre('save', function(next) {
  if (this.communications && this.communications.length > 0) {
    const latestCommunication = this.communications[this.communications.length - 1];
    this.lastContactDate = latestCommunication.createdAt;
  }
  next();
});

// Method to calculate lead score based on various factors
LeadSchema.methods.calculateLeadScore = function() {
  let score = 0;
  
  // Score based on estimated investment
  if (this.estimatedInvestment >= 1000000) score += 30;
  else if (this.estimatedInvestment >= 500000) score += 20;
  else if (this.estimatedInvestment >= 100000) score += 10;
  else if (this.estimatedInvestment >= 50000) score += 5;
  
  // Score based on investment timeframe
  switch (this.investmentTimeframe) {
    case 'Immediate': score += 25; break;
    case 'Within 1 Month': score += 20; break;
    case 'Within 3 Months': score += 15; break;
    case 'Within 6 Months': score += 10; break;
    case 'Within 1 Year': score += 5; break;
  }
  
  // Score based on lead source
  switch (this.leadSource) {
    case 'Referral':
    case 'Partner Referral': score += 20; break;
    case 'Website Form': score += 15; break;
    case 'Social Media': score += 10; break;
    case 'Cold Call': score += 5; break;
  }
  
  // Score based on engagement (communications count)
  if (this.communications.length >= 5) score += 15;
  else if (this.communications.length >= 3) score += 10;
  else if (this.communications.length >= 1) score += 5;
  
  // Score based on company (corporate leads get higher scores)
  if (this.company && this.leadType === 'Corporate') score += 10;
  
  this.leadScore = Math.min(score, 100);
  return this.leadScore;
};

// Virtual field to generate leadId from MongoDB _id (last 8 characters)
LeadSchema.virtual('leadId').get(function() {
  return this._id.toString().slice(-8).toUpperCase();
});

// Ensure virtual fields are included in JSON
LeadSchema.set('toJSON', { virtuals: true });
LeadSchema.set('toObject', { virtuals: true });

export default mongoose.model('Lead', LeadSchema);
