import express from 'express';
import {
  getLeads,
  getLead,
  createLead,
  updateLead,
  deleteLead,
  addNote,
  addCommunication,
  assignLead,
  getLeadStats,
  getFollowUpLeads,
  getAdminAssignedLeads,
  getAdminAssignedInsuranceLeads,
  updateAdminAssignedLead,
  updateAdminAssignedInsuranceLead,
  exportLeads,
  importLeads
} from '../controllers/leads.js';
import {
  validateCreateLead,
  validateUpdateLead,
  validateAddNote,
  validateAddCommunication,
  validateAssignLead,
  validateAssignmentRequired
} from '../middleware/leadValidation.js';
import { protect, authorize } from '../middleware/auth.js';
import multer from 'multer';

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

const router = express.Router();


// Protect all routes after this line
router.use(protect);

// GET /api/leads/export - Export leads to CSV (now protected)
router.get('/export', exportLeads);

// GET /api/leads/stats - Get lead statistics
router.get('/stats', getLeadStats);

// POST /api/leads/import - Import leads from CSV
router.post('/import', upload.single('file'), importLeads);

// GET /api/leads/followup - Get leads requiring follow-up
router.get('/followup', getFollowUpLeads);

// GET /api/leads/admin-assigned - Get admin assigned leads for current partner
router.get('/admin-assigned', getAdminAssignedLeads);

// GET /api/leads/admin-assigned-insurance - Get admin assigned insurance leads from admin-dashboard.insuranceleads
router.get('/admin-assigned-insurance', getAdminAssignedInsuranceLeads);

// PUT /api/leads/admin-assigned/:id - Update admin assigned lead
router.put('/admin-assigned/:id', updateAdminAssignedLead);

// PUT /api/leads/admin-assigned-insurance/:id - Update admin assigned insurance lead
router.put('/admin-assigned-insurance/:id', updateAdminAssignedInsuranceLead);

// GET /api/leads - Get all leads with filtering and pagination
router.get('/', getLeads);

// POST /api/leads - Create new lead
router.post('/', createLead);

// GET /api/leads/:id - Get single lead
router.get('/:id', getLead);

// PUT /api/leads/:id - Update lead
router.put('/:id', updateLead);

// DELETE /api/leads/:id - Delete lead (Admin only)
router.delete('/:id', authorize('admin', 'manager', 'partner'), deleteLead);

// POST /api/leads/:id/notes - Add note to lead
router.post('/:id/notes', validateAddNote, addNote);

// POST /api/leads/:id/communications - Add communication to lead
router.post('/:id/communications', validateAddCommunication, addCommunication);

// PUT /api/leads/:id/assign - Assign lead to user/partner (Admin/Manager only)
router.put('/:id/assign', 
  authorize('admin', 'manager'), 
  validateAssignLead, 
  validateAssignmentRequired, 
  assignLead
);

export default router;
