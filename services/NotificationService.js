import Notification from '../models/Notification.js';

class NotificationService {
  
  // Create a new notification
  static async create(notificationData) {
    try {
      const notification = new Notification(notificationData);
      await notification.save();
      return notification;
    } catch (error) {
      console.error('NotificationService.create error:', error);
      throw error;
    }
  }

  // Create earning notification
  static async createEarningNotification(partnerId, earningData) {
    const notification = {
      partnerId,
      title: 'New Commission Earned! 🎉',
      message: `You've earned ₹${earningData.commissionEarned?.toLocaleString()} commission from ${earningData.clientName || 'client'} for ${earningData.fundName || 'investment'}.`,
      type: 'success',
      category: 'earnings',
      priority: 'medium',
      relatedId: earningData._id,
      relatedType: 'earning',
      metadata: {
        amount: earningData.commissionEarned,
        clientName: earningData.clientName,
        fundName: earningData.fundName
      },
      actionRequired: true,
      actionUrl: '/earning',
      actionText: 'View Earnings'
    };
    
    return await this.create(notification);
  }

  // Create payment notification
  static async createPaymentNotification(partnerId, paymentData) {
    const statusMessages = {
      completed: `Payment of ₹${paymentData.amount?.toLocaleString()} has been successfully processed via ${paymentData.paymentMethod}.`,
      pending: `Your payment request of ₹${paymentData.amount?.toLocaleString()} is being processed.`,
  processing: `Your payment of ₹${paymentData.amount?.toLocaleString()} is currently being processed. We'll notify you when it's complete.`,
      failed: `Payment of ₹${paymentData.amount?.toLocaleString()} failed. Please contact support.`,
      cancelled: `Payment of ₹${paymentData.amount?.toLocaleString()} has been cancelled.`
    };
    
    const statusTitles = {
      completed: 'Payment Successful ✅',
      pending: 'Payment Processing ⏳',
  processing: 'Payment Processing ⏳',
      failed: 'Payment Failed ❌',
      cancelled: 'Payment Cancelled 🚫'
    };
    
    const statusTypes = {
      completed: 'success',
      pending: 'info',
  processing: 'info',
      failed: 'error',
      cancelled: 'warning'
    };
    
    const notification = {
      partnerId,
      title: statusTitles[paymentData.status] || 'Payment Update',
      message: statusMessages[paymentData.status] || `Payment status updated to ${paymentData.status}.`,
      type: statusTypes[paymentData.status] || 'info',
      category: 'payments',
      priority: paymentData.status === 'failed' ? 'high' : 'medium',
      relatedId: paymentData._id,
      relatedType: 'payment',
      metadata: {
        amount: paymentData.amount,
        paymentMethod: paymentData.paymentMethod,
        status: paymentData.status,
        transactionId: paymentData.transactionId
      },
      actionRequired: true,
      actionUrl: '/earning',
      actionText: 'View Payments'
    };
    
    return await this.create(notification);
  }

  // Create admin assigned leads notification
  static async createAdminAssignedLeadsNotification(partnerId, leadsCount, adminInfo = null) {
  // watcher logs suppressed
    const notification = {
      partnerId,
      title: `New Leads Assigned by Admin 📋`,
  message: `You have been assigned ${leadsCount} new lead${leadsCount > 1 ? 's' : ''} by ${adminInfo?.name || 'the admin'}. Check your Lead Generation section to view and manage these leads.`,
      type: 'info',
      category: 'leads',
      priority: 'medium',
      relatedId: partnerId,
      relatedType: 'lead',
      metadata: {
        leadsCount,
        assignedBy: adminInfo?.name || 'Admin',
        assignmentDate: new Date()
      },
      actionRequired: true,
      actionUrl: '/leadgeneration',
      actionText: 'View Assigned Leads'
    };
    
    try {
      const created = await this.create(notification);
  // watcher logs suppressed
      return created;
    } catch (err) {
  // watcher logs suppressed
      throw err;
    }
  }

  // Create document notification
  static async createDocumentNotification(partnerId, documentData, action = 'uploaded') {
    const actionMessages = {
      uploaded: `Document "${documentData.originalName}" has been uploaded successfully.`,
      approved: `Document "${documentData.originalName}" has been approved.`,
      rejected: `Document "${documentData.originalName}" has been rejected. Please review and resubmit.`,
      expired: `Document "${documentData.originalName}" has expired. Please upload a new version.`
    };
    
    const actionTitles = {
      uploaded: 'Document Uploaded 📄',
      approved: 'Document Approved ✅',
      rejected: 'Document Rejected ❌',
      expired: 'Document Expired ⚠️'
    };
    
    const actionTypes = {
      uploaded: 'info',
      approved: 'success',
      rejected: 'error',
      expired: 'warning'
    };
    
    const notification = {
      partnerId,
      title: actionTitles[action] || 'Document Update',
      message: actionMessages[action] || `Document "${documentData.originalName}" status updated.`,
      type: actionTypes[action] || 'info',
      category: 'documents',
      priority: action === 'rejected' ? 'high' : 'medium',
      relatedId: documentData._id,
      relatedType: 'document',
      metadata: {
        documentName: documentData.originalName,
        documentType: documentData.documentType,
        action
      },
      actionRequired: action === 'rejected',
      actionUrl: '/documents',
      actionText: 'View Documents'
    };
    
    return await this.create(notification);
  }

  // Create lead notification
  static async createLeadNotification(partnerId, leadData, action = 'created') {
    const actionMessages = {
      created: `New lead "${leadData.name}" has been added to your pipeline.`,
      updated: `Lead "${leadData.name}" has been updated.`,
      converted: `Congratulations! Lead "${leadData.name}" has been converted.`,
      lost: `Lead "${leadData.name}" has been marked as lost.`
    };
    
    const actionTitles = {
      created: 'New Lead Added 👤',
      updated: 'Lead Updated 📝',
      converted: 'Lead Converted 🎉',
      lost: 'Lead Lost 😞'
    };
    
    const actionTypes = {
      created: 'info',
      updated: 'info',
      converted: 'success',
      lost: 'warning'
    };
    
    const notification = {
      partnerId,
      title: actionTitles[action] || 'Lead Update',
      message: actionMessages[action] || `Lead "${leadData.name}" status updated.`,
      type: actionTypes[action] || 'info',
      category: 'leads',
      priority: action === 'converted' ? 'high' : 'medium',
      relatedId: leadData._id,
      relatedType: 'lead',
      metadata: {
        leadName: leadData.name,
        leadStatus: leadData.leadStatus,
        action
      },
      actionRequired: false,
      actionUrl: '/leadgeneration',
      actionText: 'View Leads'
    };
    
    return await this.create(notification);
  }

  // Create system notification
  static async createSystemNotification(partnerId, title, message, priority = 'medium', metadata = {}) {
    const notification = {
      partnerId,
      title: `System: ${title} 🔔`,
      message,
      type: 'info',
      category: 'system',
      priority,
      metadata,
      actionRequired: false
    };
    
    return await this.create(notification);
  }

  // Create welcome notification
  static async createWelcomeNotification(partnerId, partnerName) {
    const notification = {
      partnerId,
      title: `Welcome to Partner Portal! 🎉`,
      message: `Hello ${partnerName}! Welcome to the Partner Portal. Please upload your documents to get started with your partner journey.`,
      type: 'info',
      category: 'system',
      priority: 'medium',
      metadata: {
        isWelcome: true,
        partnerName
      },
      actionRequired: true,
      actionUrl: '/documents',
      actionText: 'Get Started'
    };
    
    return await this.create(notification);
  }

  // Create reminder notification
  static async createReminderNotification(partnerId, title, message, actionUrl = null) {
    const notification = {
      partnerId,
      title: `Reminder: ${title} ⏰`,
      message,
      type: 'warning',
      category: 'reminders',
      priority: 'medium',
      actionRequired: !!actionUrl,
      actionUrl,
      actionText: actionUrl ? 'Take Action' : null
    };
    
    return await this.create(notification);
  }

  // Send bulk notifications to multiple partners
  static async createBulkNotification(partnerIds, notificationData) {
    try {
      const notifications = partnerIds.map(partnerId => ({
        ...notificationData,
        partnerId
      }));
      
      const result = await Notification.insertMany(notifications);
      return result;
    } catch (error) {
      console.error('NotificationService.createBulkNotification error:', error);
      throw error;
    }
  }

  // Clean up expired notifications
  static async cleanupExpiredNotifications() {
    try {
      const result = await Notification.deleteMany({
        expiresAt: { $lt: new Date() }
      });
      console.log(`Cleaned up ${result.deletedCount} expired notifications`);
      return result;
    } catch (error) {
      console.error('NotificationService.cleanupExpiredNotifications error:', error);
      throw error;
    }
  }

  // Mark notifications as delivered (for real-time updates)
  static async markAsDelivered(notificationIds) {
    try {
      const result = await Notification.updateMany(
        { _id: { $in: notificationIds } },
        { 
          $set: { 
            deliveryStatus: 'delivered', 
            deliveredAt: new Date() 
          } 
        }
      );
      return result;
    } catch (error) {
      console.error('NotificationService.markAsDelivered error:', error);
      throw error;
    }
  }
}

export default NotificationService;
