import express from 'express';
import { getAllLeads, createOrAssignLead, bulkAssignLeads, assignEarning, getLeadTrend, acknowledgeLeadByAdmin, assignPartnerEarning } from '../../controllers/admin/adminLeadsController.js';
import { adminUpload } from '../../middleware/admin/upload.js';

const router = express.Router();

router.get('/leads', getAllLeads);
router.post('/create-lead', createOrAssignLead);
router.post('/bulk-assign-leads', adminUpload.single('csvFile'), bulkAssignLeads);
router.put('/assign-earning', assignEarning);
router.get('/leads/trend', getLeadTrend);
router.put('/acknowledge-lead', acknowledgeLeadByAdmin);
router.post('/assign-partner-earning', assignPartnerEarning);

export default router;
