import express from 'express';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getNotificationsByCategory,
  getNotificationStats,
  createNotificationHttp
} from '../controllers/notifications.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// All notification routes require authentication
router.use(protect);

// Get all notifications with pagination and filtering
router.get('/', getNotifications);

// Get unread notifications count
router.get('/unread-count', getUnreadCount);

// Get notification statistics
router.get('/stats', getNotificationStats);

// Get notifications by category
router.get('/category/:category', getNotificationsByCategory);

// Mark specific notification as read
router.patch('/:notificationId/read', markAsRead);

// Mark all notifications as read
router.patch('/mark-all-read', markAllAsRead);

// Delete specific notification
router.delete('/:notificationId', deleteNotification);

// Create notification (for client-triggered events)
router.post('/', createNotificationHttp);

export default router;
