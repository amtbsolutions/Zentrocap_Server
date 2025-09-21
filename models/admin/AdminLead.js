import mongoose from 'mongoose';

const AdminLeadSchema = new mongoose.Schema({
  registrationNo: { type: String, required: true },
  registrationDate: { type: Date, required: true },
  ownerName: { type: String, required: true },
  currentAddress: { type: String, required: true },
  engineNumber: { type: String, required: true },
  chassisNumber: { type: String, required: true },
  vehicleMaker: { type: String, required: true },
  vehicleModel: { type: String, required: true },
  vehicleClass: { type: String },
  vehicleCategory: { type: String },
  fuelType: { type: String },
  ladenWeight: { type: Number },
  seatCapacity: { type: Number },
  state: { type: String },
  city: { type: String },
  ownerMobileNumber: { type: String, required: true },

  assignedPartnerEmail: { type: String },

  status: {
    type: String,
    enum: ['Pending', 'Contacted', 'Interested', 'Completed', 'Not Interested', 'Terminated'],
    default: 'Pending'
  },

  awaitingAdminApproval: { type: Boolean, default: false },

  interestedInsurance: [{
    insurance: { type: mongoose.Schema.Types.ObjectId, ref: 'Insurance' },
    saleAmount: { type: Number },
    startDate: { type: Date },
    validityYears: { type: Number }
  }],

  earningType: { type: String, enum: ['Percent', 'LumpSum'], default: 'Percent' },
  rate: { type: Number, default: 0 },
  insuranceSaleAmount: { type: Number, default: 0 },
  earningAmount: { type: Number, default: 0 },

  // Partner-updated insurance details
  saleDate: { type: Date },
  leadExpiry: { type: Date },
  insuranceType: { type: String },
  // Persistent flag to indicate whether a partner earning was created for this lead
  earningAssigned: { type: Boolean, default: false },

  adminAcknowledged: { type: Boolean, default: false },
  adminAcknowledgmentDate: { type: Date },

  createdAt: { type: Date, default: Date.now }
}, { collection: 'leads', strict: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

// Expose saleAmount as a virtual alias of insuranceSaleAmount for UI backwards compatibility
AdminLeadSchema.virtual('saleAmount').get(function() { return this.insuranceSaleAmount; });
AdminLeadSchema.virtual('saleAmount').set(function(v) { this.insuranceSaleAmount = v; });

export default mongoose.model('AdminLead', AdminLeadSchema);
