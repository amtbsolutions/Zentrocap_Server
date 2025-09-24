import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Admin from '../../models/admin/Admin.js';
import AdminPermission from '../../models/admin/AdminPermission.js';
import { sendOTPEmail, generateOTP } from '../../utils/emailUtils.js';

export const signup = async (req, res) => {
  const t0 = Date.now();
  try {
    const { fullName, email, mobile, password } = req.body;
    const exists = await Admin.findOne({ $or: [{ email }, { mobile }] });
    if (exists) return res.status(400).json({ message: 'Admin already exists with given email or mobile.' });

    const hashed = await bcrypt.hash(String(password).trim(), 10);
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    const admin = await Admin.create({ fullName, email, mobile, password: hashed, otp, otpExpiry, isVerified: false });
    await AdminPermission.create({ adminId: admin._id, designation: 'admin_manager', permissions: ['admin_manager'] });

    // Fire-and-forget email dispatch
    setImmediate(async () => {
      const sendStart = Date.now();
      try {
        const r = await sendOTPEmail(email, otp, 'registration', fullName || 'Admin');
        if (!r.success) {
          console.error('admin-signup:otp-email-failed', { email, error: r.error, elapsedMs: Date.now() - sendStart });
        } else {
          console.log('admin-signup:otp-email-sent', { email, messageId: r.messageId, elapsedMs: Date.now() - sendStart });
        }
      } catch (err) {
        console.error('admin-signup:otp-email-unhandled', { email, error: err.message, elapsedMs: Date.now() - sendStart });
      }
    });

    return res.status(201).json({
      message: 'Signup successful. OTP sent to email.',
      asyncEmail: true,
      processingMs: Date.now() - t0
    });
  } catch (e) {
    return res.status(500).json({ message: 'Signup failed', error: e.message });
  }
};

export const resendOtp = async (req, res) => {
  const t0 = Date.now();
  try {
    const { email } = req.body;
    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(404).json({ message: 'Admin not found.' });
    const otp = generateOTP();
    admin.otp = otp; admin.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await admin.save();

    setImmediate(async () => {
      const sendStart = Date.now();
      try {
        const r = await sendOTPEmail(email, otp, 'registration', admin.fullName || 'Admin');
        if (!r.success) {
          console.error('admin-resend-otp:email-failed', { email, error: r.error, elapsedMs: Date.now() - sendStart });
        } else {
          console.log('admin-resend-otp:email-sent', { email, messageId: r.messageId, elapsedMs: Date.now() - sendStart });
        }
      } catch (err) {
        console.error('admin-resend-otp:email-unhandled', { email, error: err.message, elapsedMs: Date.now() - sendStart });
      }
    });

    return res.json({ message: 'New OTP sent to email.', asyncEmail: true, processingMs: Date.now() - t0 });
  } catch (e) {
    return res.status(500).json({ message: 'Failed to resend OTP', error: e.message });
  }
};

export const login = async (req, res) => {
  const t0 = Date.now();
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(404).json({ message: 'Admin not found.' });
    if (admin.isSuspended) return res.status(403).json({ message: 'Account suspended. Contact another administrator.' });
    const ok = await bcrypt.compare(String(password).trim(), admin.password);
    if (!ok) return res.status(400).json({ message: 'Incorrect password.' });
    const otp = generateOTP();
    admin.otp = otp; admin.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await admin.save();

    setImmediate(async () => {
      const sendStart = Date.now();
      try {
        const r = await sendOTPEmail(admin.email, otp, 'login', admin.fullName || 'Admin');
        if (!r.success) {
          console.error('admin-login:otp-email-failed', { email: admin.email, error: r.error, elapsedMs: Date.now() - sendStart });
        } else {
          console.log('admin-login:otp-email-sent', { email: admin.email, messageId: r.messageId, elapsedMs: Date.now() - sendStart });
        }
      } catch (err) {
        console.error('admin-login:otp-email-unhandled', { email: admin.email, error: err.message, elapsedMs: Date.now() - sendStart });
      }
    });

    return res.json({
      message: 'OTP sent to your email. Please verify to proceed.',
      requiresOTPVerification: true,
      email: admin.email,
      asyncEmail: true,
      processingMs: Date.now() - t0
    });
  } catch (e) {
    return res.status(500).json({ message: 'Login failed', error: e.message });
  }
};

export const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(404).json({ message: 'Admin not found.' });
    if (admin.isSuspended) return res.status(403).json({ message: 'Account suspended. Contact another administrator.' });
    if (!admin.otp || !admin.otpExpiry) return res.status(400).json({ message: 'OTP not generated or expired' });
    const isMatch = String(admin.otp).trim() === String(otp).trim();
    const expired = new Date(admin.otpExpiry).getTime() < Date.now();
    if (!isMatch) return res.status(400).json({ message: 'Invalid OTP.' });
    if (expired) return res.status(400).json({ message: 'OTP expired.' });

    if (!admin.isApproved) {
      return res.status(403).json({ message: 'Approval pending from existing admin. Contact admin for further help.' });
    }

    admin.otp = null; admin.otpExpiry = null; admin.isVerified = true;
    await admin.save();

    const designation = await AdminPermission.findOne({ adminId: admin._id });
    if (!designation) return res.status(500).json({ message: 'Admin designation data not found.' });

    const token = jwt.sign({ id: admin._id, email: admin.email, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '1d' });
    return res.json({
      message: 'OTP verified. Access granted.',
      token,
      role: 'admin',
      email: admin.email,
      isVerified: true,
      isApproved: admin.isApproved,
      designation: designation.designation,
      permissions: designation.permissions,
    });
  } catch (e) {
    return res.status(500).json({ message: 'OTP verification failed', error: e.message });
  }
};

export const forgotPassword = async (req, res) => {
  const t0 = Date.now();
  try {
    const { email } = req.body;
    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(404).json({ message: 'Admin not found' });
    const otp = generateOTP();
    admin.otp = otp; admin.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await admin.save();

    setImmediate(async () => {
      const sendStart = Date.now();
      try {
        const r = await sendOTPEmail(email, otp, 'reset', admin.fullName || 'Admin');
        if (!r.success) {
          console.error('admin-forgot-password:otp-email-failed', { email, error: r.error, elapsedMs: Date.now() - sendStart });
        } else {
          console.log('admin-forgot-password:otp-email-sent', { email, messageId: r.messageId, elapsedMs: Date.now() - sendStart });
        }
      } catch (err) {
        console.error('admin-forgot-password:otp-email-unhandled', { email, error: err.message, elapsedMs: Date.now() - sendStart });
      }
    });

    return res.json({ message: 'OTP sent to email for password reset.', asyncEmail: true, processingMs: Date.now() - t0 });
  } catch (e) {
    return res.status(500).json({ message: 'Failed to send OTP', error: e.message });
  }
};

export const verifyResetOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(404).json({ message: 'Admin not found' });
    if (!admin.otp || !admin.otpExpiry) return res.status(400).json({ message: 'OTP not generated or expired' });
    const isMatch = String(admin.otp) === String(otp);
    const expired = new Date(admin.otpExpiry).getTime() < Date.now();
    if (!isMatch) return res.status(400).json({ message: 'Invalid OTP' });
    if (expired) return res.status(400).json({ message: 'OTP expired' });
    const resetToken = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '10m' });
    return res.json({ message: 'OTP verified', resetToken });
  } catch (e) {
    return res.status(500).json({ message: 'OTP verification failed', error: e.message });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(404).json({ message: 'Admin not found' });
    const hashed = await bcrypt.hash(String(newPassword).trim(), 10);
    admin.password = hashed; admin.otp = null; admin.otpExpiry = null;
    await admin.save();
    return res.json({ message: 'Password reset successful' });
  } catch (e) {
    return res.status(500).json({ message: 'Password reset failed', error: e.message });
  }
};

export const getAllAdmins = async (_req, res) => {
  try {
    // Use aggregation to merge designation & permissions
    const admins = await Admin.aggregate([
      { $sort: { createdAt: -1 } },
      { $project: { password: 0 } },
      {
        $lookup: {
          from: 'adminpermissions', // collection name lowercased & pluralized by Mongoose
          localField: '_id',
          foreignField: 'adminId',
          as: 'permissionDocs'
        }
      },
      {
        $addFields: {
          designation: { $ifNull: [ { $arrayElemAt: ['$permissionDocs.designation', 0] }, null ] },
          permissions: { $ifNull: [ { $arrayElemAt: ['$permissionDocs.permissions', 0] }, [] ] }
        }
      },
      { $project: { permissionDocs: 0 } }
    ]);
    res.json({ success: true, admins });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

export const updateAdminApproval = async (req, res) => {
  try {
    const { email, isApproved } = req.body;
    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });
    admin.isApproved = !!isApproved; await admin.save();
    res.json({ success: true, message: 'Admin approval updated', admin: { email: admin.email, isApproved: admin.isApproved } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

export const assignAdminDesignation = async (req, res) => {
  try {
    const { email, designation, permissions } = req.body;
    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });
    const doc = await AdminPermission.findOneAndUpdate(
      { adminId: admin._id },
      { designation: designation || 'admin_manager', permissions: permissions || ['admin_manager'] },
      { upsert: true, new: true }
    );
    res.json({ success: true, message: 'Designation updated', designation: doc.designation, permissions: doc.permissions });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// Suspend (soft toggle) an admin
export const suspendAdmin = async (req, res) => {
  try {
    const { email, suspended } = req.body;
    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });
    admin.isSuspended = !!suspended;
    if (admin.isSuspended) {
      // Force re-approval after suspension
      admin.isApproved = false;
    }
    await admin.save();
    res.json({ success: true, message: `Admin ${admin.isSuspended ? 'suspended' : 'reinstated (requires approval)'}`, email: admin.email, isSuspended: admin.isSuspended, isApproved: admin.isApproved });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// Delete an admin (hard delete)
export const deleteAdmin = async (req, res) => {
  try {
    const { email } = req.params;
    const admin = await Admin.findOneAndDelete({ email });
    if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });
    await AdminPermission.deleteMany({ adminId: admin._id });
    res.json({ success: true, message: 'Admin deleted', email });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
