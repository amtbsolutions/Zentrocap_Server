import express from 'express';
import { listPendingRedemptions, markRedemptionCredited, markRedemptionFailed } from '../controllers/adminRedemptions.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// In real deployments, add admin authorization middleware (e.g., isAdmin)
router.get('/redemptions/pending', protect, listPendingRedemptions);
router.post('/redemptions/:id/credit', protect, markRedemptionCredited);
router.post('/redemptions/:id/fail', protect, markRedemptionFailed);

export default router;
