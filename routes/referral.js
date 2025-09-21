import express from 'express';
import { protect } from '../middleware/auth.js';
import {
  getReferralOverview,
  getReferralHistory,
  validateReferralCode,
  getReferralCommissions,
  getRedemptionSummary,
  debugReferralState,
  resetReferralLedgerForCurrent,
  cleanupLegacyReferralFields
} from '../controllers/referral.js';

const router = express.Router();

// Public route (no auth required) for validating referral codes during signup
router.get('/validate/:referralCode', validateReferralCode);

// All other routes require authentication
router.use(protect);

// GET /api/referrals/overview - Get referral stats and overview
router.get('/overview', getReferralOverview);

// GET /api/referrals/history - Get detailed referral history with pagination
router.get('/history', getReferralHistory);

// GET /api/referrals/commissions - Get commission details
router.get('/commissions', getReferralCommissions);

// GET /api/referrals/redemptions/summary - Get redemption totals per referral
router.get('/redemptions/summary', getRedemptionSummary);

// DEBUG
router.get('/debug', debugReferralState);
router.post('/debug/reset-ledger', resetReferralLedgerForCurrent);
router.post('/debug/cleanup-legacy', cleanupLegacyReferralFields);

export default router;
