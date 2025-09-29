import mongoose from 'mongoose';

const AdminLeadSchema = new mongoose.Schema({
  registrationNo: { type: String },
  registrationDate: { type: Date },
  ownerName: { type: String },
  currentAddress: { type: String },
  engineNumber: { type: String },
  chassisNumber: { type: String },
  vehicleMaker: { type: String },
  vehicleModel: { type: String },
  vehicleClass: { type: String },
  vehicleCategory: { type: String },
  fuelType: { type: String },
  ladenWeight: { type: Number },
  seatCapacity: { type: Number },
  state: { type: String },
  city: { type: String },
  ownerMobileNumber: { type: String },
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
  saleDate: { type: Date },
  leadExpiry: { type: Date },
  insuranceType: { type: String },
  earningAssigned: { type: Boolean, default: false },
  adminAcknowledged: { type: Boolean, default: false },
  adminAcknowledgmentDate: { type: Date },
  createdAt: { type: Date, default: Date.now }
}, { collection: 'leads', strict: false, toJSON: { virtuals: true }, toObject: { virtuals: true } });

// Virtual for backwards compatibility
AdminLeadSchema.virtual('saleAmount').get(function() { return this.insuranceSaleAmount; });
AdminLeadSchema.virtual('saleAmount').set(function(v) { this.insuranceSaleAmount = v; });

export default mongoose.model('AdminLead', AdminLeadSchema);
