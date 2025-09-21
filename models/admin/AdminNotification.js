import mongoose from 'mongoose';

const adminNotificationSchema = new mongoose.Schema({
  type: { type: String, required: true },
  message: { type: String, required: true },
  relatedLead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
  createdBy: { type: String },
  isRead: { type: Boolean, default: false },
}, { timestamps: true });

export default mongoose.model('AdminNotification', adminNotificationSchema);
