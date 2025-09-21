import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  // Recipient
  partnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Partner',
    required: true,
    index: true
  },
  
  // Notification Content
  title: {
    type: String,
    required: true,
    maxlength: 100
  },
  message: {
    type: String,
    required: true,
    maxlength: 500
  },
  
  // Notification Type and Category
  type: {
    type: String,
    enum: [
      'info',           // General information
      'success',        // Success notifications (payments, approvals)
      'warning',        // Warning notifications (document issues, deadline reminders)
      'error',          // Error notifications (payment failures, rejections)
      'earning',        // New earning notifications
      'payment',        // Payment-related notifications
      'document',       // Document-related notifications
      'lead',           // Lead-related notifications
      'system'          // System announcements
    ],
    required: true,
    default: 'info'
  },
  
  category: {
    type: String,
    enum: [
      'earnings',
      'payments',
      'documents', 
      'leads',
      'profile',
      'system',
      'security',
      'reminders'
    ],
    required: true
  },
  
  // Status and Priority
  isRead: {
    type: Boolean,
    default: false,
    index: true
  },
  
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  
  // Related Data (optional references)
  relatedId: {
    type: mongoose.Schema.Types.ObjectId,
    required: false
  },
  
  relatedType: {
    type: String,
    enum: ['earning', 'payment', 'document', 'lead', 'partner'],
    required: false
  },
  
  // Metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Action Data (for actionable notifications)
  actionRequired: {
    type: Boolean,
    default: false
  },
  
  actionUrl: {
    type: String,
    required: false
  },
  
  actionText: {
    type: String,
    required: false
  },
  
  // Delivery and Expiry
  scheduledFor: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  expiresAt: {
    type: Date,
    required: false
    // TTL index defined separately below; removed inline index to avoid duplication
  },
  
  // Delivery Status
  deliveryStatus: {
    type: String,
    enum: ['pending', 'delivered', 'failed'],
    default: 'pending'
  },
  
  deliveredAt: {
    type: Date,
    required: false
  },
  
  // Read Status
  readAt: {
    type: Date,
    required: false
  }
}, {
  timestamps: true
});

// Indexes for better performance
notificationSchema.index({ partnerId: 1, createdAt: -1 });
notificationSchema.index({ partnerId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ partnerId: 1, type: 1, createdAt: -1 });
notificationSchema.index({ partnerId: 1, category: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Pre-save middleware
notificationSchema.pre('save', function(next) {
  if (this.isRead && !this.readAt) {
    this.readAt = new Date();
  }
  next();
});

// Instance methods
notificationSchema.methods.markAsRead = function() {
  this.isRead = true;
  this.readAt = new Date();
  return this.save();
};

notificationSchema.methods.markAsDelivered = function() {
  this.deliveryStatus = 'delivered';
  this.deliveredAt = new Date();
  return this.save();
};

// Static methods
notificationSchema.statics.getUnreadCount = function(partnerId) {
  return this.countDocuments({ partnerId, isRead: false });
};

notificationSchema.statics.markAllAsRead = function(partnerId) {
  return this.updateMany(
    { partnerId, isRead: false },
    { 
      $set: { 
        isRead: true, 
        readAt: new Date() 
      } 
    }
  );
};

notificationSchema.statics.getRecentNotifications = function(partnerId, limit = 10) {
  return this.find({ partnerId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('partnerId', 'name email');
};

notificationSchema.statics.getNotificationsByCategory = function(partnerId, category, limit = 20) {
  return this.find({ partnerId, category })
    .sort({ createdAt: -1 })
    .limit(limit);
};

export default mongoose.model('Notification', notificationSchema);
