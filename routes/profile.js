import express from 'express';
import { 
  getUserProfile, 
  updateUserProfile, 
  getPersonalDocuments,
  getPaymentPreferences,
  updatePaymentPreferences,
  getPartnerPaymentPreferencesForAdmin,
  getPaymentPreferencesRawForInvoice
} from '../controllers/profile.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// Profile routes - protected with authentication
router.get('/', protect, getUserProfile);
router.put('/update', protect, updateUserProfile);

// Personal documents route - protected with authentication
router.get('/documents', protect, getPersonalDocuments);

// Payment preferences routes - protected with authentication
router.get('/payment-preferences', protect, getPaymentPreferences);
router.put('/payment-preferences', protect, updatePaymentPreferences);
// Invoice-only (authenticated partner): return unmasked details for invoice generation
router.get('/payment-preferences/invoice-raw', protect, getPaymentPreferencesRawForInvoice);

// Admin route to get partner payment preferences (for payment processing)
// Enhanced security: Admin role required + additional validations
router.get('/admin/partner/:partnerId/payment-preferences', 
  protect, 
  authorize('admin', 'superadmin'), 
  getPartnerPaymentPreferencesForAdmin
);

export default router;
