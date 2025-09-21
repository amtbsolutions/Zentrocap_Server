import mongoose from 'mongoose';

// Create a connection to the admin-dashboard database
export const connectAdminDB = () => {
  try {
    const adminDBUri = process.env.MONGODB_URI.replace(/\/[^/]*$/, '/admin-dashboard');
    const adminConnection = mongoose.createConnection(adminDBUri, {
  // useNewUrlParser and useUnifiedTopology are deprecated and removed
    });

    adminConnection.on('connected', () => {
      // watcher logs suppressed
    });

    adminConnection.on('error', (err) => {
      // watcher logs suppressed
    });

    return adminConnection;
  } catch (error) {
    // watcher logs suppressed
    throw error;
  }
};

// Define admin lead schema for reuse
export const createAdminLeadModel = (connection) => {
  const AdminLeadSchema = new mongoose.Schema({
    name: String,
    email: String,
    phone: String,
    city: String,
    state: String,
    pincode: String,
    leadSource: String,
    status: String,
    priority: String,
    interestedProducts: [String],
  // Investment fields
  investmentAmount: Number,
  budget: Number,
  investmentDate: Date,
  saleAmount: Number,
  saleDate: Date,
  insuranceType: String,
    notes: String,
    assignedPartner: String, // This will be the partner ID
    assignedBy: String,
    assignedAt: Date,
    createdAt: Date,
    updatedAt: Date
  }, { collection: 'leads' });
  
  return connection.model('AdminLead', AdminLeadSchema);
};

// Define admin insurance lead schema for insuranceleads collection
export const createAdminInsuranceLeadModel = (connection) => {
  const AdminInsuranceLeadSchema = new mongoose.Schema({
    // Basic identity
    name: String,
    ownerName: String,
    contact: String,
    phone: String,
    email: String,
    // Location
    city: String,
    state: String,
    address: String,
    // Vehicle/Insurance specific
    registrationNo: String,
    registrationNumber: String,
    vehicleRegistration: String,
    registrationDate: Date,
    engineNumber: String,
    chassisNumber: String,
    vehicleMaker: String,
    manufacturer: String,
    vehicleModel: String,
    model: String,
    // Workflow
    status: String,
    priority: String,
    // Financials
    saleAmount: Number,
    saleDate: Date,
    insuranceType: String,
    // Assignment
    assignedPartner: String,
    assignedBy: String,
    assignedAt: Date,
    // System
    createdAt: Date,
    updatedAt: Date
  }, { collection: 'insuranceleads', strict: false });

  return connection.model('AdminInsuranceLead', AdminInsuranceLeadSchema);
};
