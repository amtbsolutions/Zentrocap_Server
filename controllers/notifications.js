import Notification from '../models/Notification.js';
import mongoose from 'mongoose';

// Get all notifications for authenticated partner
export const getNotifications = async (req, res) => {
  try {
    const partnerId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const type = req.query.type;
    const category = req.query.category;
    const isRead = req.query.isRead;
    
    // Build filter query
    const filter = { partnerId };
    
    if (type) filter.type = type;
    if (category) filter.category = category;
    if (isRead !== undefined) filter.isRead = isRead === 'true';
    
    // Calculate skip value for pagination
    const skip = (page - 1) * limit;
    
    // Get notifications with pagination
    const [notifications, totalCount, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-__v'),
      
      Notification.countDocuments(filter),
      
      Notification.countDocuments({ partnerId, isRead: false })
    ]);
    
    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;
    
    res.status(200).json({
      success: true,
      data: {
        notifications,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          limit,
          hasNextPage,
          hasPrevPage
        },
        unreadCount
      }
    });
    
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching notifications',
      error: error.message
    });
  }
};

// Get unread notifications count
export const getUnreadCount = async (req, res) => {
  try {
    const partnerId = req.user._id;
    const unreadCount = await Notification.countDocuments({ 
      partnerId, 
      isRead: false 
    });
    
    res.status(200).json({
      success: true,
      data: { unreadCount, count: unreadCount }
    });
    
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching unread count',
      error: error.message
    });
  }
};

// Create a notification for the authenticated partner (HTTP)
export const createNotificationHttp = async (req, res) => {
  try {
    const partnerId = req.user._id;
    const {
      title,
      message,
      type = 'lead',
      category = 'leads',
      priority = 'medium',
      relatedId,
      relatedType = 'lead',
      actionUrl,
      actionText,
      metadata = {}
    } = req.body || {};

    if (!title || !message) {
      return res.status(400).json({ success: false, message: 'title and message are required' });
    }

    const notification = await Notification.create({
      partnerId,
      title,
      message,
      type,
      category,
      priority,
      relatedId,
      relatedType,
      actionUrl,
      actionText,
      metadata
    });

    res.status(201).json({ success: true, data: notification });
  } catch (error) {
    console.error('Create notification (http) error:', error);
    res.status(500).json({ success: false, message: 'Error creating notification', error: error.message });
  }
};

// Mark notification as read
export const markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const partnerId = req.user._id;
    
    const notification = await Notification.findOne({
      _id: notificationId,
      partnerId
    });
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }
    
    await notification.markAsRead();
    
    res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      data: notification
    });
    
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking notification as read',
      error: error.message
    });
  }
};

// Mark all notifications as read
export const markAllAsRead = async (req, res) => {
  try {
    const partnerId = req.user._id;
    
    const result = await Notification.markAllAsRead(partnerId);
    
    res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
      data: { modifiedCount: result.modifiedCount }
    });
    
  } catch (error) {
    console.error('Mark all as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking all notifications as read',
      error: error.message
    });
  }
};

// Delete notification
export const deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const partnerId = req.user._id;
    
    const notification = await Notification.findOneAndDelete({
      _id: notificationId,
      partnerId
    });
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Notification deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting notification',
      error: error.message
    });
  }
};

// Create notification (internal use by system)
export const createNotification = async (notificationData) => {
  try {
    const notification = new Notification(notificationData);
    await notification.save();
    return notification;
  } catch (error) {
    console.error('Create notification error:', error);
    throw error;
  }
};

// Bulk create notifications
export const createBulkNotifications = async (notifications) => {
  try {
    const result = await Notification.insertMany(notifications);
    return result;
  } catch (error) {
    console.error('Create bulk notifications error:', error);
    throw error;
  }
};

// Get notifications by category
export const getNotificationsByCategory = async (req, res) => {
  try {
    const partnerId = req.user._id;
    const { category } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    
    const notifications = await Notification.getNotificationsByCategory(
      partnerId, 
      category, 
      limit
    );
    
    res.status(200).json({
      success: true,
      data: notifications
    });
    
  } catch (error) {
    console.error('Get notifications by category error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching notifications by category',
      error: error.message
    });
  }
};

// Get notification statistics
export const getNotificationStats = async (req, res) => {
  try {
    const partnerId = req.user._id;
    
    const [
      totalCount,
      unreadCount,
      todayCount,
      typeBreakdown,
      categoryBreakdown
    ] = await Promise.all([
      // Total notifications
      Notification.countDocuments({ partnerId }),
      
      // Unread notifications
      Notification.countDocuments({ partnerId, isRead: false }),
      
      // Today's notifications
      Notification.countDocuments({
        partnerId,
        createdAt: {
          $gte: new Date(new Date().setHours(0, 0, 0, 0))
        }
      }),
      
      // Breakdown by type
      Notification.aggregate([
        { $match: { partnerId: new mongoose.Types.ObjectId(String(partnerId)) } },
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      
      // Breakdown by category
      Notification.aggregate([
        { $match: { partnerId: new mongoose.Types.ObjectId(String(partnerId)) } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ])
    ]);
    
    res.status(200).json({
      success: true,
      data: {
        totalCount,
        unreadCount,
        readCount: totalCount - unreadCount,
        todayCount,
        typeBreakdown: typeBreakdown.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        categoryBreakdown: categoryBreakdown.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {})
      }
    });
    
  } catch (error) {
    console.error('Get notification stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching notification statistics',
      error: error.message
    });
  }
};
