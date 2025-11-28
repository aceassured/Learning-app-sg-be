// src/controller/notificationController.js
import pool from '../../database.js';
import { io } from '../../index.js'; // Import io from your main server file

// Get all notifications for a user with time-based grouping
export const getUserNotifications = async (req, res) => {
  const userId = req.query.userId || req.user?.id;

  if (!userId) {
    return res.status(400).json({ error: "Missing userId" });
  }

  try {
    const result = await pool.query(
      `SELECT 
        id, 
        user_id, 
        message, 
        type, 
        subject, 
        is_read, 
        is_viewed, 
        created_at,
        CASE 
          WHEN created_at >= CURRENT_DATE THEN 'today'
          WHEN created_at >= CURRENT_DATE - INTERVAL '7 days' THEN 'thisWeek'
          ELSE 'earlier'
        END as time_section
       FROM notifications 
       WHERE user_id = $1 AND type != 'reminder'
       ORDER BY created_at DESC`,
      [userId]
    );

    const notifications = result.rows.map(notification => ({
      ...notification,
      read: notification.is_read,
      viewed: notification.is_viewed
    }));

    const unreadCount = notifications.filter(n => !n.is_read).length;

    res.json({
      notifications,
      unreadCount,
      success: true
    });
  } catch (error) {
    console.error("❌ Error fetching notifications:", error);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
};

// get all notification not showed notifications.......


export const getUserNotificationsNotshown = async (req, res) => {
  const userId = req.query.userId || req.user?.id;

  if (!userId) {
    return res.status(400).json({ error: "Missing userId" });
  }

  try {

    // 1️⃣ Fetch only NOT SHOWN notifications (used for popup)
    const popupResult = await pool.query(
      `SELECT 
        id, user_id, message, type, subject, is_read, is_viewed, is_shown, created_at,
        CASE 
          WHEN created_at >= CURRENT_DATE THEN 'today'
          WHEN created_at >= CURRENT_DATE - INTERVAL '7 days' THEN 'thisWeek'
          ELSE 'earlier'
        END as time_section
       FROM notifications 
       WHERE user_id = $1 
         AND type != 'reminder' 
         AND is_shown = false
       ORDER BY created_at DESC`,
      [userId]
    );

    const notifications = popupResult.rows.map(n => ({
      ...n,
      read: n.is_read,
      viewed: n.is_viewed
    }));

    // 2️⃣ Unread count should include ALL unread notifications, even if is_shown = true
    const unreadResult = await pool.query(
      `SELECT COUNT(*) 
       FROM notifications 
       WHERE user_id = $1 
         AND type != 'reminder'
         AND is_read = false`,
      [userId]
    );

    const unreadCount = parseInt(unreadResult.rows[0].count, 10);

    res.json({
      notifications, // popup notifications only
      unreadCount,   // full unread count
      success: true
    });

  } catch (error) {
    console.error("❌ Error fetching notifications:", error);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
};



// Mark notifications as read
export const markNotificationsAsRead = async (req, res) => {
  const { userId, ids } = req.body;

  if (!userId || !ids || !Array.isArray(ids)) {
    return res.status(400).json({ error: "Missing userId or notification ids" });
  }

  try {
    await pool.query(
      "UPDATE notifications SET is_read = true WHERE user_id = $1 AND id = ANY($2::int[])",
      [userId, ids]
    );

    res.json({ success: true, message: "Notifications marked as read" });
  } catch (error) {
    console.error("❌ Error marking notifications as read:", error);
    res.status(500).json({ error: "Failed to mark notifications as read" });
  }
};

// Mark notifications as viewed (when user sees them in notification page)
export const markNotificationsAsViewed = async (req, res) => {
  const { userId, ids } = req.body;

  if (!userId || !ids || !Array.isArray(ids)) {
    return res.status(400).json({ error: "Missing userId or notification ids" });
  }

  try {
    await pool.query(
      "UPDATE notifications SET is_viewed = true, is_read = true WHERE user_id = $1 AND id = ANY($2::int[])",
      [userId, ids]
    );

    // Get updated unread count
    const countResult = await pool.query(
      "SELECT COUNT(*) as unread_count FROM notifications WHERE user_id = $1 AND is_read = false AND type != 'reminder'",
      [userId]
    );

    const unreadCount = parseInt(countResult.rows[0].unread_count);
    res.json({
      success: true,
      message: "Notifications marked as viewed",
      unreadCount
    });
  } catch (error) {
    console.error("❌ Error marking notifications as viewed:", error);
    res.status(500).json({ error: "Failed to mark notifications as viewed" });
  }
};

// Send notification (for system use)
export const sendNotification = async (req, res) => {
  const { userId, message, type, subject } = req.body;

  if (!userId || !message) {
    return res.status(400).json({ error: "userId and message are required" });
  }

  try {
    const query = `
      INSERT INTO notifications (user_id, message, type, subject, is_read, is_viewed) 
      VALUES ($1, $2, $3, $4, false, false) 
      RETURNING *
    `;
    const values = [userId, message, type || "general", subject || null];
    const result = await pool.query(query, values);

    const notification = {
      ...result.rows[0],
      read: false,
      viewed: false,
      time_section: 'today' // New notifications are always today
    };

    // Send real-time notification via socket
    if (global.onlineUsers && global.onlineUsers[userId]) {
      io.to(global.onlineUsers[userId]).emit("notification", notification);
      console.log(`📨 Sent real-time notification to user ${userId}`);
    }

    res.json({ success: true, notification });
  } catch (error) {
    console.error("❌ Error sending notification:", error);
    res.status(500).json({ error: "Failed to send notification" });
  }
};

// Get unread notification count
export const getUnreadCount = async (req, res) => {
  const userId = req.query.userId || req.user?.id;

  if (!userId) {
    return res.status(400).json({ error: "Missing userId" });
  }

  try {
    const result = await pool.query(
      "SELECT COUNT(*) as unread_count FROM notifications WHERE user_id = $1 AND is_read = false",
      [userId]
    );

    const unreadCount = parseInt(result.rows[0].unread_count);

    res.json({ unreadCount, success: true });
  } catch (error) {
    console.error("❌ Error getting unread count:", error);
    res.status(500).json({ error: "Failed to get unread count" });
  }
};

// Helper function to create notifications for different events
export const createQuizNotification = async (userId, subject, message) => {
  try {
    const query = `
      INSERT INTO notifications (user_id, message, type, subject, is_read, is_viewed) 
      VALUES ($1, $2, 'quiz', $3, false, false) 
      RETURNING *
    `;
    const result = await pool.query(query, [userId, message, subject]);

    const notification = {
      ...result.rows[0],
      read: false,
      viewed: false,
      time_section: 'today'
    };

    // Send real-time notification
    if (global.onlineUsers && global.onlineUsers[userId]) {
      io.to(global.onlineUsers[userId]).emit("notification", notification);
    }

    return notification;
  } catch (error) {
    console.error("❌ Error creating quiz notification:", error);
    return null;
  }
};

export const createForumNotification = async (userId, message) => {
  try {
    const query = `
      INSERT INTO notifications (user_id, message, type, is_read, is_viewed) 
      VALUES ($1, $2, 'forum', false, false) 
      RETURNING *
    `;
    const result = await pool.query(query, [userId, message]);

    const notification = {
      ...result.rows[0],
      read: false,
      viewed: false,
      time_section: 'today'
    };

    // Send real-time notification
    if (global.onlineUsers && global.onlineUsers[userId]) {
      io.to(global.onlineUsers[userId]).emit("notification", notification);
    }

    return notification;
  } catch (error) {
    console.error("❌ Error creating forum notification:", error);
    return null;
  }
};

export const createStreakNotification = async (userId, subject, streakDays) => {
  try {
    const message = `🔥 You're on a ${streakDays}-day streak in ${subject}! Keep it up!`;
    const query = `
      INSERT INTO notifications (user_id, message, type, subject, is_read, is_viewed) 
      VALUES ($1, $2, 'streak', $3, false, false) 
      RETURNING *
    `;
    const result = await pool.query(query, [userId, message, subject]);

    const notification = {
      ...result.rows[0],
      read: false,
      viewed: false,
      time_section: 'today'
    };

    // Send real-time notification
    if (global.onlineUsers && global.onlineUsers[userId]) {
      io.to(global.onlineUsers[userId]).emit("notification", notification);
    }

    return notification;
  } catch (error) {
    console.error("❌ Error creating streak notification:", error);
    return null;
  }
};

export const createProgressNotification = async (userId, subject, progressMessage) => {
  try {
    const query = `
      INSERT INTO notifications (user_id, message, type, subject, is_read, is_viewed) 
      VALUES ($1, $2, 'progress', $3, false, false) 
      RETURNING *
    `;
    const result = await pool.query(query, [userId, progressMessage, subject]);

    const notification = {
      ...result.rows[0],
      read: false,
      viewed: false,
      time_section: 'today'
    };

    // Send real-time notification
    if (global.onlineUsers && global.onlineUsers[userId]) {
      io.to(global.onlineUsers[userId]).emit("notification", notification);
    }

    return notification;
  } catch (error) {
    console.error("❌ Error creating progress notification:", error);
    return null;
  }
};

// mark as shown notification............



export const markAsShownnotification = async (req, res) => {
  try {
    // const userId = req.query.userId || req.user?.id;
    const { notificationIds, userId} = req.body;
console.log(userId)
console.log(notificationIds)
    // Fix: Use notificationIds consistently
    if (!userId || !notificationIds || !Array.isArray(notificationIds)) {
      return res.status(400).json({ error: "Missing userId or notification ids" });
    }

    await pool.query(
      "UPDATE notifications SET is_shown = true WHERE user_id = $1 AND id = ANY($2::int[])",
      [userId, notificationIds]
    );

    res.json({ success: true, message: "Notifications marked as shown" });

  } catch (error) {
    console.error("❌ Error marking notifications as shown:", error);
    res.status(500).json({ error: "Failed to mark notifications as shown" });
  }
};