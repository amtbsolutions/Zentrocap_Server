import express from 'express';
import { signup, verifyOtp, resendOtp, login, forgotPassword, verifyResetOtp, resetPassword, getAllAdmins, updateAdminApproval, assignAdminDesignation, suspendAdmin, deleteAdmin } from '../../controllers/admin/adminController.js';
import { getAdminNotifications, markNotificationAsRead, markAllNotificationsRead } from '../../controllers/admin/adminNotificationsController.js';

const router = express.Router();

router.post('/signup', signup);
router.post('/verify-otp', verifyOtp);
router.post('/resend-otp', resendOtp);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/verify-reset-otp', verifyResetOtp);
router.post('/reset-password', resetPassword);
router.get('/all', getAllAdmins);
router.put('/approve-or-reject', updateAdminApproval);
router.post('/assignAdmin', assignAdminDesignation);
router.put('/suspend', suspendAdmin);
router.delete('/delete/:email', deleteAdmin);

export default router;

// Notifications
router.get('/notifications', getAdminNotifications);
router.post('/notifications/read', markNotificationAsRead);
router.post('/notifications/read-all', markAllNotificationsRead);
