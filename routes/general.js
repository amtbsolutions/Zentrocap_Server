import express from 'express';
import { getDashboardStats, getQuickStats, getRecentActivities } from '../controllers/general.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// All dashboard routes require authentication
router.use(protect);

// Dashboard statistics
router.get('/dashboard-stats', getDashboardStats);

// Quick stats for widgets
router.get('/quick-stats', getQuickStats);

// Recent activities
router.get('/recent-activities', getRecentActivities);

export default router;
