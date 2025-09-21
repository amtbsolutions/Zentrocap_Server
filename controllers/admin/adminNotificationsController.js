import AdminNotification from '../../models/admin/AdminNotification.js';

export const getAdminNotifications = async (req, res) => {
  try {
    const notifications = await AdminNotification.find().sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, notifications });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

export const markNotificationAsRead = async (req, res) => {
  try {
    const { notificationId } = req.body;
    const n = await AdminNotification.findById(notificationId);
    if (!n) return res.status(404).json({ success: false, message: 'Notification not found' });
    n.isRead = true; await n.save();
    res.json({ success: true, message: 'Notification marked as read', notification: n });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

export const markAllNotificationsRead = async (_req, res) => {
  try {
    await AdminNotification.updateMany({ isRead: false }, { $set: { isRead: true } });
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
