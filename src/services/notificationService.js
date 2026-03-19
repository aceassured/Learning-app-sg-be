// src/services/notificationService.js
import pool from '../../database.js';
import { io } from "../../index.js";
import { sendPushNotification } from '../config/firebaseAdmin.js';
import cron from "node-cron"

export class NotificationService {

  // Helper to check if notification already exists for today
  static async notificationExistsForToday(userId, type, subject = null) {
      const query = `
    SELECT id FROM notifications 
    WHERE user_id = $1 AND type = $2 AND DATE(created_at) = CURRENT_DATE
    ${subject ? 'AND subject = $3' : ''}
  `;
      const params = subject ? [userId, type, subject] : [userId, type];
      const result = await pool.query(query, params);
      return result.rows.length > 0;
  }

  // Helper to check if notification exists for this week
  static async notificationExistsForWeek(userId, type, subject = null) {
      const query = `
    SELECT id FROM notifications 
    WHERE user_id = $1 AND type = $2 AND created_at >= CURRENT_DATE - INTERVAL '7 days'
    ${subject ? 'AND subject = $3' : ''}
  `;
      const params = subject ? [userId, type, subject] : [userId, type];
      const result = await pool.query(query, params);
      return result.rows.length > 0;
  }

  // Insert notification and send real-time
  static async insertNotification(userId, message, type, subject = null) {
      try {
          const query = `
      INSERT INTO notifications (user_id, message, type, subject, is_read, is_viewed) 
      VALUES ($1, $2, $3, $4, false, false) 
      RETURNING *
    `;
          const result = await pool.query(query, [userId, message, type, subject]);

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
          console.error("Error inserting notification:", error);
          return null;
      }
  }

  // 1. Daily Quiz Available Notification
  static async createDailyQuizNotification(userId) {
      try {
          const exists = await this.notificationExistsForToday(userId, 'quiz');
          if (exists) return;

          const todaySession = await pool.query(
              `SELECT id FROM user_quiz_sessions 
       WHERE user_id = $1 AND DATE(created_at) = CURRENT_DATE AND finished_at IS NOT NULL`,
              [userId]
          );

          if (todaySession.rows.length > 0) return;

          const userResult = await pool.query(
              'SELECT selected_subjects FROM users WHERE id = $1',
              [userId]
          );

          if (!userResult.rows[0]?.selected_subjects?.length) return;

          const subjectIds = userResult.rows[0].selected_subjects;
          const randomSubjectId = subjectIds[Math.floor(Math.random() * subjectIds.length)];

          const subjectResult = await pool.query(
              'SELECT subject FROM subjects WHERE id = $1',
              [randomSubjectId]
          );

          if (!subjectResult.rows[0]) return;

          const subject = subjectResult.rows[0].subject;
          const message = `📚 New daily quiz available in ${subject}! Test your knowledge now.`;

          await this.insertNotification(userId, message, 'quiz', subject);
      } catch (error) {
          console.error("Error creating daily quiz notification:", error);
      }
  }

  // 2. Streak Notification
  static async createStreakNotification(userId) {
      try {
          const exists = await this.notificationExistsForToday(userId, 'streak');
          if (exists) return;

          const streakQuery = `
      WITH daily_sessions AS (
        SELECT DISTINCT DATE(created_at) as session_date
        FROM user_quiz_sessions 
        WHERE user_id = $1 AND finished_at IS NOT NULL
        ORDER BY session_date DESC
      ),
      streak_calculation AS (
        SELECT session_date,
               session_date - ROW_NUMBER() OVER (ORDER BY session_date DESC) * INTERVAL '1 day' as streak_group
        FROM daily_sessions
      )
      SELECT COUNT(*) as streak_days
      FROM streak_calculation 
      WHERE streak_group = (
        SELECT session_date - ROW_NUMBER() OVER (ORDER BY session_date DESC) * INTERVAL '1 day'
        FROM daily_sessions 
        LIMIT 1
      )
    `;

          const streakResult = await pool.query(streakQuery, [userId]);
          const streakDays = parseInt(streakResult.rows[0]?.streak_days || 0);

          if (streakDays >= 3) {
              const subjectResult = await pool.query(`
        SELECT s.subject, COUNT(*) as session_count
        FROM user_quiz_sessions uqs
        JOIN subjects s ON s.id = ANY(
          SELECT unnest(u.selected_subjects) 
          FROM users u WHERE u.id = $1
        )
        WHERE uqs.user_id = $1 AND uqs.finished_at IS NOT NULL
          AND uqs.created_at >= CURRENT_DATE - INTERVAL '${streakDays} days'
        GROUP BY s.subject
        ORDER BY session_count DESC
        LIMIT 1
      `, [userId]);

              const subject = subjectResult.rows[0]?.subject || 'your studies';
              const message = `🔥 Amazing! You're on a ${streakDays}-day streak in ${subject}! Keep it up!`;

              await this.insertNotification(userId, message, 'streak', subject);
          }
      } catch (error) {
          console.error("Error creating streak notification:", error);
      }
  }

  /*
  // 3. Progress Notification (After Quiz Completion)  ❌ TOPIC BASED - COMMENTED
  static async createProgressNotification(userId, sessionId) {
      try {
          const sessionResult = await pool.query(`
    SELECT DISTINCT 
      t.id AS topic_id,
      t.topic AS topic_name,
      s.subject
    FROM user_quiz_sessions uqs
    JOIN user_answers ua ON ua.session_id = uqs.id
    JOIN questions q ON q.id = ua.question_id
    JOIN topics t ON t.id = q.topic_id
    JOIN subjects s ON s.id = t.subject_id
    WHERE uqs.id = $1 AND uqs.user_id = $2
  `, [sessionId, userId]);

          if (!sessionResult.rows[0]) return;

          const session = sessionResult.rows[0];

          const topicPerformance = await pool.query(`
SELECT 
  AVG(CASE WHEN ua.is_correct THEN 1.0 ELSE 0.0 END) * 100 AS avg_score,
  COUNT(*) AS total_attempts
FROM user_answers ua
JOIN (
  SELECT id
  FROM user_quiz_sessions
  WHERE user_id = $1
    AND finished_at IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 10
) AS last_sessions ON last_sessions.id = ua.session_id
JOIN questions q ON q.id = ua.question_id
WHERE q.topic_id = $2
  `, [userId, session.topic_id]);

          const avgScore = parseFloat(topicPerformance.rows[0]?.avg_score || 0);
          const attempts = parseInt(topicPerformance.rows[0]?.total_attempts || 0);

          let message = '';
          if (avgScore >= 90) {
              message = `🎯 Excellent! You're mastering ${session.topic_name} in ${session.subject} with ${avgScore.toFixed(0)}% average!`;
          } else if (avgScore >= 75) {
              message = `📈 Great progress in ${session.topic_name}! Your ${session.subject} skills are improving - ${avgScore.toFixed(0)}% average!`;
          } else if (attempts >= 5) {
              message = `💪 Keep practicing ${session.topic_name} in ${session.subject}. You're getting better with each attempt!`;
          } else {
              return;
          }

          const exists = await this.notificationExistsForToday(userId, 'progress', session.subject);
          if (!exists) {
              await this.insertNotification(userId, message, 'progress', session.subject);
          }

      } catch (error) {
          console.error("Error creating progress notification:", error);
      }
  }
  */

  // 4. Forum Comments Notification
  static async createForumCommentsNotification(userId) {
      try {
          const exists = await this.notificationExistsForToday(userId, 'forum');
          if (exists) return;

          const commentsResult = await pool.query(`
      SELECT 
        fp.forum_title,
        COUNT(fc.id) as comment_count,
        COUNT(DISTINCT fc.user_id) as unique_commenters
      FROM forum_posts fp
      LEFT JOIN forum_comments fc ON fc.post_id = fp.id
      WHERE fp.user_id = $1 
        AND fc.created_at >= CURRENT_DATE - INTERVAL '1 day'
        AND fc.user_id != $2
      GROUP BY fp.id, fp.forum_title
      HAVING COUNT(fc.id) > 0
      ORDER BY comment_count DESC
      LIMIT 1
    `, [userId, userId]);

          if (commentsResult.rows.length > 0) {
              const { title, comment_count, unique_commenters } = commentsResult.rows[0];
              const message = `💬 Your post "${title.substring(0, 30)}..." received ${comment_count} new comment${comment_count > 1 ? 's' : ''} from ${unique_commenters} member${unique_commenters > 1 ? 's' : ''}!`;

              await this.insertNotification(userId, message, 'forum');
          }
      } catch (error) {
          console.error("Error creating forum comments notification:", error);
      }
  }

  // 5. Forum Likes Notification
  static async createForumLikesNotification(userId) {
      try {
          const exists = await this.notificationExistsForToday(userId, 'forum');
          if (exists) return;

          const likesResult = await pool.query(`
      SELECT 
        fp.forum_title,
        COUNT(fl.id) as like_count
      FROM forum_posts fp
      LEFT JOIN forum_likes fl ON fl.post_id = fp.id
      WHERE fp.user_id = $1 
        AND fl.created_at >= CURRENT_DATE - INTERVAL '1 day'
        AND fl.user_id != $2
      GROUP BY fp.id, fp.forum_title
      HAVING COUNT(fl.id) > 0
      ORDER BY like_count DESC
      LIMIT 1
    `, [userId, userId]);

          if (likesResult.rows.length > 0) {
              const { title, like_count } = likesResult.rows[0];
              const message = `👍 Your post "${title.substring(0, 30)}..." received ${like_count} new like${like_count > 1 ? 's' : ''}!`;

              await this.insertNotification(userId, message, 'forum');
          }
      } catch (error) {
          console.error("Error creating forum likes notification:", error);
      }
  }

  /*
  // 7. Topic Improvement Notification ❌ TOPIC BASED - COMMENTED
  static async createTopicImprovementNotification(userId) {
      ...
  }
  */

  static async generateLoginNotifications(userId) {
      try {
          console.log(`🔔 Generating notifications for user ${userId}`);

          await this.createForumCommentsNotification(userId);
          await this.createForumLikesNotification(userId);

          console.log(`✅ Notifications generated for user ${userId}`);
      } catch (error) {
          console.error("Error generating login notifications:", error);
      }
  }

  static async generateQuizCompletionNotifications(userId, sessionId) {
      try {

          // await this.createProgressNotification(userId, sessionId); ❌ topic based

      } catch (error) {
          console.error("Error generating quiz completion notifications:", error);
      }
  }
}





// web push...........

/**
 * Send notification to user (WebSocket + Push)
 * Automatically determines if user is online or offline
 */
export const sendNotificationToUser = async (userId, notificationData) => {
  try {
    // 1. Save notification to database
    const query = `
      INSERT INTO notifications (user_id, message, type, subject, is_read, is_viewed) 
      VALUES ($1, $2, $3, $4, false, false) 
      RETURNING *
    `;
    const values = [
      userId,
      notificationData.message,
      notificationData.type || 'general',
      notificationData.subject || null,
    ];
    const result = await pool.query(query, values);
    const notification = {
      ...result.rows[0],
      read: false,
      viewed: false,
      time_section: 'today',
    };

    // // 2. Check if user is online (WebSocket)
    // const isOnline = global.onlineUsers && global.onlineUsers[userId];

    // if (isOnline) {
    //   // Send via WebSocket (real-time)
    //   io.to(global.onlineUsers[userId]).emit('notification', notification);
    //   console.log(`📨 Real-time notification sent to user ${userId}`);
    // }

    if (isOnline) {
      io.to(global.onlineUsers[userId]).emit('notification', notification);
    }

    // 3. Get user's FCM token
    const userResult = await pool.query(
      'SELECT fcm_token FROM users WHERE id = $1',
      [userId]
    );

    const fcmToken = userResult.rows[0]?.fcm_token;

    // 4. Send push notification (works even if offline)
    if (fcmToken) {
      const pushResult = await sendPushNotification(fcmToken, {
        title: notificationData.title || 'Acehive',
        message: notificationData.message,
        type: notificationData.type,
        subject: notificationData.subject,
        url: notificationData.url || '/',
      });

      // If token is invalid, remove it
      if (pushResult.shouldDelete) {
        await pool.query('UPDATE users SET fcm_token = NULL WHERE id = $1', [userId]);
        console.log(`🗑️ Removed invalid FCM token for user ${userId}`);
      }

      console.log(
        isOnline
          ? `✅ Notification sent via WebSocket + Push to user ${userId}`
          : `✅ Push notification sent to offline user ${userId}`
      );
    } else {
      console.log(
        isOnline
          ? `✅ Real-time notification sent (no FCM token)`
          : `⚠️ User ${userId} is offline and has no FCM token`
      );
    }

    return { success: true, notification };
  } catch (error) {
    console.error('❌ Error sending notification:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send daily reminder notifications based on user's reminder_time
 * Runs every minute to check for users who need reminders
 */

// utc time.....
export const startReminderCron = () => {

  console.log(" Starting reminder cron service...");

  // Run every minute
  cron.schedule('* * * * *', async () => {

    try {

      console.log("--------------------------------------------------");
      console.log("⏳ Cron triggered");

      const now = new Date();
      console.log(" UTC Time:", now.toISOString());

      //  GET IST TIME CORRECTLY (NO MANUAL OFFSET)
      const istTimeStr = now.toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour12: false,
      });

      // Format → HH:MM:SS
      const [hours, minutes, seconds] = istTimeStr.split(":");
      const currentTimeStr = `${hours}:${minutes}:00`;

      console.log("🇮 IST Time:", istTimeStr);
      console.log(` Checking reminders for IST ${currentTimeStr}`);
      console.log(" Running DB query...");

      //  FIXED QUERY (TIME RANGE MATCH)
      const result = await pool.query(
        `SELECT 
           u.id,
           u.name,
           u.fcm_token,
           s.daily_reminder_time
         FROM users u
         INNER JOIN user_settings s ON s.user_id = u.id
         WHERE s.reminder_enabled = true
         AND s.daily_reminder_time >= $1::time
         AND s.daily_reminder_time < ($1::time + INTERVAL '1 minute')`,
        [currentTimeStr]
      );

      console.log(" DB Result Rows:", result.rows.length);

      const users = result.rows;

      if (users.length === 0) {
        console.log(" No users found for this reminder time");
        return;
      }

      console.log(` Sending reminders to ${users.length} users`);

      for (const user of users) {

        console.log(` Processing user ID: ${user.id}`);
        console.log(` User Name: ${user.name}`);
        console.log(` FCM Token: ${user.fcm_token}`);

        if (!user.fcm_token) {
          console.log(` User ${user.id} has no FCM token. Skipping.`);
          continue;
        }

        console.log(` Sending notification to user ${user.id}`);

        const notificationResult = await sendNotificationToUser(user.id, {
          title: 'Daily Quiz Reminder',
          message: `Hi ${user.name}! Time for your daily learning session. Let's keep your streak going!`,
          type: 'reminder',
          subject: 'Daily Reminder',
          url: '/quiz',
        });

        console.log(" Notification result:", notificationResult);
      }

      console.log(` Finished sending notifications`);

    } catch (error) {
      console.error(' Error in reminder cron job:', error);
    }

  });

  console.log(' Reminder cron job started (runs every minute)');
};





// export const testReminderCron = async (req, res) => {
//   try {

//     console.log("🧪 Manual reminder test triggered");

//     const result = await pool.query(
//       `SELECT 
//          u.id,
//          u.name,
//          u.fcm_token,
//          s.daily_reminder_time
//        FROM users u
//        INNER JOIN user_settings s ON s.user_id = u.id
//        WHERE s.reminder_enabled = true`
//     );

//     console.log("📊 DB Result Rows:", result.rows.length);

//     const users = result.rows;

//     if (users.length === 0) {
//       return res.json({
//         success: true,
//         message: "No users with reminder enabled"
//       });
//     }

//     let sent = 0;

//     for (const user of users) {

//       console.log(`👤 Processing user ID: ${user.id}`);
//       console.log(`📱 FCM Token: ${user.fcm_token}`);

//       if (!user.fcm_token) {
//         console.log(`⚠️ User ${user.id} has no FCM token`);
//         continue;
//       }

//       const notificationResult = await sendNotificationToUser(user.id, {
//         title: '📚 Daily Quiz Reminder',
//         message: `Hi ${user.name}! Time for your daily learning session.`,
//         type: 'reminder',
//         subject: 'Daily Reminder',
//         url: '/quiz',
//       });

//       console.log("📬 Notification result:", notificationResult);

//       if (notificationResult?.success) sent++;

//     }

//     return res.json({
//       success: true,
//       users_found: users.length,
//       notifications_sent: sent
//     });

//   } catch (error) {

//     console.error("❌ Test cron error:", error);

//     return res.status(500).json({
//       success: false,
//       error: error.message
//     });

//   }
// };









let reminderCronStarted = false;

// export const startReminderCron = () => {
//   if (reminderCronStarted) return; // Prevent multiple cron instances
//   reminderCronStarted = true;

//   // Run every minute
//   cron.schedule('* * * * *', async () => {
//     try {
//       const currentTime = new Date();

//       // Convert UTC to IST (+5:30)
//       const istOffsetMinutes = 5 * 60 + 30; // 5 hours 30 minutes
//       const istTime = new Date(currentTime.getTime() + istOffsetMinutes * 60 * 1000);

//       const hours = istTime.getHours().toString().padStart(2, '0');
//       const minutes = istTime.getMinutes().toString().padStart(2, '0');
//       const currentTimeStr = `${hours}:${minutes}:00`;

//       console.log(`⏰ Checking reminders for IST ${currentTimeStr}...`);

//       // ✅ Get users who have reminders enabled and time matches
//       const result = await pool.query(
//         `SELECT 
//            u.id, 
//            u.name, 
//            u.fcm_token, 
//            s.daily_reminder_time
//          FROM users u
//          INNER JOIN user_settings s ON s.user_id = u.id
//          WHERE s.reminder_enabled = true
//          AND s.daily_reminder_time = $1::time`,
//         [currentTimeStr]
//       );

//       const users = result.rows;

//       if (users.length === 0) return;

//       console.log(`📢 Sending reminders to ${users.length} users at ${currentTimeStr}`);

//       // Send notifications
//       for (const user of users) {
//         await sendNotificationToUser(user.id, {
//           title: '📚 Daily Quiz Reminder',
//           message: `Hi ${user.name}! Time for your daily learning session. Let's keep your streak going! 🔥`,
//           type: 'reminder',
//           subject: 'Daily Reminder',
//           url: '/quiz',
//         });
//       }

//       console.log(`✅ Sent ${users.length} reminder notifications`);
//     } catch (error) {
//       console.error('❌ Error in reminder cron job:', error);
//     }
//   });

//   console.log('✅ Reminder cron job started (runs every minute)');
// };



// Test///

// export const testReminderCron = async (req, res) => {
//   try {

//     const currentTime = new Date();

//     // Convert UTC → IST
//     const istOffsetMinutes = 5 * 60 + 30;
//     const istTime = new Date(currentTime.getTime() + istOffsetMinutes * 60 * 1000);

//     const hours = istTime.getHours().toString().padStart(2, '0');
//     const minutes = istTime.getMinutes().toString().padStart(2, '0');
//     const currentTimeStr = `${hours}:${minutes}:00`;

//     console.log(`⏰ Checking reminders for IST ${currentTimeStr}...`);

//     // 🔹 Removed time condition for testing
//     const result = await pool.query(
//       `SELECT 
//          u.id, 
//          u.name, 
//          u.fcm_token, 
//          s.daily_reminder_time
//        FROM users u
//        INNER JOIN user_settings s ON s.user_id = u.id
//        WHERE s.reminder_enabled = true`
//     );

//     const users = result.rows;

//     if (users.length === 0) {
//       return res.json({
//         success: true,
//         message: "No users with reminder enabled",
//         time: currentTimeStr
//       });
//     }

//     console.log(`📢 Sending reminders to ${users.length} users`);

//     let sentCount = 0;

//     for (const user of users) {

//       if (!user.fcm_token) {
//         console.log(`⚠️ User ${user.id} has no FCM token`);
//         continue;
//       }

//       await sendNotificationToUser(user.id, {
//         title: '📚 Daily Quiz Reminder',
//         message: `Hi ${user.name}! Time for your daily learning session. Let's keep your streak going! 🔥`,
//         type: 'reminder',
//         subject: 'Daily Reminder',
//         url: '/quiz',
//       });

//       sentCount++;

//     }

//     console.log(`✅ Sent ${sentCount} reminder notifications`);

//     return res.json({
//       success: true,
//       total_users: users.length,
//       users_notified: sentCount,
//       time_checked: currentTimeStr
//     });

//   } catch (error) {

//     console.error("❌ Cron test error:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Cron test failed"
//     });

//   }
// };


/**
 * Send quiz availability notifications
 * Can be called when a new quiz is created
 */

export const sendQuizAvailableNotification = async (subject) => {
  try {
    // Get all users who are subscribed to this subject
    const result = await pool.query(
      `SELECT DISTINCT u.id, u.name, u.fcm_token
       FROM users u
       JOIN user_subjects us ON u.id = us.user_id
       JOIN subjects s ON us.subject_id = s.id
       WHERE s.subject = $1`,
      [subject]
    );

    const users = result.rows;

    if (users.length === 0) {
      console.log(`No users found for subject: ${subject}`);
      return { success: true, count: 0 };
    }

    console.log(`📢 Sending quiz notifications to ${users.length} users for ${subject}`);

    let successCount = 0;
    for (const user of users) {
      const result = await sendNotificationToUser(user.id, {
        title: '📚 New Quiz Available',
        message: `New daily quiz available in ${subject}! Test your knowledge now.`,
        type: 'quiz',
        subject: subject,
        url: '/quiz',
      });

      if (result.success) successCount++;
    }

    console.log(`✅ Sent ${successCount}/${users.length} quiz notifications`);
    return { success: true, count: successCount };
  } catch (error) {
    console.error('❌ Error sending quiz notifications:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Initialize all notification services
 */
export const initializeNotificationServices = () => {
  console.log('🚀 Initializing notification services...');
  startReminderCron();
  console.log('✅ All notification services initialized');
};