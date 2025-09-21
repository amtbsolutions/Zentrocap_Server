import mongoose from 'mongoose';

const AdminPermissionSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true, index: true },
  designation: { type: String, default: 'admin_manager' },
  permissions: { type: [String], default: ['admin_manager'] },
}, { timestamps: true });

export default mongoose.model('AdminPermission', AdminPermissionSchema);
