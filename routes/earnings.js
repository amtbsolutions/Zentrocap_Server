import express from 'express';
import { protect } from '../middleware/auth.js';
import {
  getEarningsOverview,
  getEarnings,
  getPaymentHistory,
  getRecentTransactions,
  exportEarnings,
  createEarning,
  processPayment,
  updateEarningStatus,
  updatePaymentStatus
} from '../controllers/earnings.js';
import { emailInvoice, testEmailInvoice } from '../controllers/earnings.js';
import { requestWithdrawal } from '../controllers/withdrawals.js';
import { createWithdrawalRequest, updateWithdrawalStatus, listMyWithdrawals, listAllWithdrawals } from '../controllers/withdrawController.js';

const router = express.Router();

// Apply authentication middleware to all earnings routes
router.use(protect);

// GET /api/earnings/overview - Get earnings dashboard data
router.get('/overview', getEarningsOverview);

// GET /api/earnings - Get earnings list with filters and pagination
router.get('/', getEarnings);

// GET /api/earnings/payments - Get payment history
router.get('/payments', getPaymentHistory);

// GET /api/earnings/recent - Get recent transactions
router.get('/recent', getRecentTransactions);

// GET /api/earnings/export - Export earnings data
router.get('/export', exportEarnings);

// POST /api/earnings - Create new earning transaction
router.post('/', createEarning);

// POST /api/earnings/payment - Process payment for earnings
router.post('/payment', processPayment);

// PUT /api/earnings/:earningId/status - Update earning status
router.put('/:earningId/status', updateEarningStatus);

// PUT /api/earnings/payment/:paymentId/status - Update payment status
router.put('/payment/:paymentId/status', updatePaymentStatus);

// POST /api/earnings/withdraw - Request withdrawal of approved earnings
router.post('/withdraw', requestWithdrawal);

// New withdrawal request system (improved)
router.post('/withdrawals', createWithdrawalRequest); // Partner initiates
router.get('/withdrawals', listMyWithdrawals);       // Partner views their requests
router.get('/withdrawals/admin/all', listAllWithdrawals); // Admin list all (consider admin auth)
// Admin would call below (later add admin auth middleware)
router.put('/withdrawals/:id/status', updateWithdrawalStatus);

// Email invoice to partner
router.post('/email-invoice', emailInvoice);
router.get('/email-invoice/test', testEmailInvoice);

export default router;
