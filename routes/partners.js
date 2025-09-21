import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { getPartners, approvePartner, updatePartnerStatus, recalcPartnerAggregates } from '../controllers/partners.js';
import { deletePartner } from '../controllers/partners.js'

const router = express.Router();

// All routes here require authentication and admin/superadmin role
router.use(protect, authorize('admin', 'superadmin'));

// GET /api/partners/recalculate - recalc aggregates (admin)
router.get('/recalculate', recalcPartnerAggregates);

// GET /api/partners - list partners (supports ?compute=1&persist=1)
router.get('/', getPartners);

// PATCH /api/partners/:partnerId/approve - approve a partner
router.patch('/:partnerId/approve', approvePartner);

// PATCH /api/partners/:partnerId/status - update partner status
router.patch('/:partnerId/status', updatePartnerStatus);
// DELETE /api/partners/:partnerId - delete a partner
router.delete('/:partnerId', deletePartner);

export default router;
