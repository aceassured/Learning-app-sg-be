// src/router/notificationRouter.js
import express from 'express';
import auth from '../middleware/auth.js';
import { 
  getUserNotifications, 
  markNotificationsAsRead, 
  markNotificationsAsViewed,
  sendNotification,
  getUnreadCount, 
  markAsShownnotification,
  getUserNotificationsNotshown
} from '../controller/notificationController.js';

const router = express.Router();

// Get all notifications for authenticated user
router.get('/', auth, getUserNotifications);
router.get('/not-shown-notifications', auth, getUserNotificationsNotshown);

// Get unread count only
router.get('/unread-count', auth, getUnreadCount);

// Mark notifications as read
router.put('/mark-as-read', auth, markNotificationsAsRead);

// Mark notifications as viewed
router.put('/mark-as-viewed', auth, markNotificationsAsViewed);
router.put('/mark-as-shown', auth, markAsShownnotification);

// Send notification (admin/system use)
router.post('/send', sendNotification);

export default router;