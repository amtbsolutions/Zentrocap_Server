import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  originalName: { type: String, required: true },
  documentType: {
    type: String,
    required: true,
    enum: ['general', 'aadhaar', 'pan', 'business', 'certificate', 'bank-statement', 'other', 'policy', 'compliance', 'marketing', 'training']
  },
  mimetype: { type: String, required: true },
  originalSize: { type: Number, required: true },
  compressedSize: { type: Number, required: true },
  gridfsId: { type: mongoose.Schema.Types.ObjectId, required: true },
  fileUrl: { type: String, required: true },
  downloadUrl: { type: String, required: true },
  previewUrl: { type: String },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true },
  uploadedAt: { type: Date, default: Date.now },
  isSignupDocument: { type: Boolean, default: false },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  notes: { type: String },
  tags: [{ type: String }],
  expiresAt: { type: Date }
}, { timestamps: true });

documentSchema.index({ uploadedBy: 1, documentType: 1 });
documentSchema.index({ status: 1 });
documentSchema.index({ createdAt: -1 });

export default mongoose.model('Document', documentSchema);
