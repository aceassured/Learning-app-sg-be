// src/config/notificationConfig.js
export const NOTIFICATION_CONFIG = {
  // Notification types
  TYPES: {
    QUIZ: 'quiz',
    STREAK: 'streak',
    PROGRESS: 'progress',
    FORUM: 'forum',
    WEEKLY_PROGRESS: 'weekly_progress',
    IMPROVEMENT: 'improvement'
  },

  // Minimum requirements for notifications
  REQUIREMENTS: {
    MIN_STREAK_DAYS: 3,
    MIN_QUESTIONS_FOR_AVERAGE: 10,
    MIN_QUESTIONS_FOR_TOPIC: 5,
    MIN_IMPROVEMENT_PERCENTAGE: 10,
    MIN_WEEKLY_SCORE: 75
  },

  // Notification frequency limits
  FREQUENCY: {
    DAILY_NOTIFICATIONS: ['quiz', 'streak', 'forum'],
    WEEKLY_NOTIFICATIONS: ['weekly_progress', 'improvement']
  },

  // Messages templates
  MESSAGES: {
    QUIZ_AVAILABLE: (subject) => `📚 New daily quiz available in ${subject}! Test your knowledge now.`,
    STREAK: (days, subject) => `🔥 Amazing! You're on a ${days}-day streak in ${subject}! Keep it up!`,
    PROGRESS_EXCELLENT: (topic, subject, score) => 
      `🎯 Excellent! You're mastering ${topic} in ${subject} with ${score}% average!`,
    PROGRESS_GOOD: (topic, subject, score) => 
      `📈 Great progress in ${topic}! Your ${subject} skills are improving - ${score}% average!`,
    PROGRESS_PRACTICE: (topic, subject) => 
      `💪 Keep practicing ${topic} in ${subject}. You're getting better with each attempt!`,
    FORUM_COMMENTS: (title, count, commenters) => 
      `💬 Your post "${title.substring(0, 30)}..." received ${count} new comment${count > 1 ? 's' : ''} from ${commenters} member${commenters > 1 ? 's' : ''}!`,
    FORUM_LIKES: (title, count) => 
      `👍 Your post "${title.substring(0, 30)}..." received ${count} new like${count > 1 ? 's' : ''}!`,
    WEEKLY_HIGH_SCORE: (percentage, subject) => 
      `🌟 This week's highlight: ${percentage}% average in ${subject}! You're on fire!`,
    TOPIC_IMPROVEMENT: (topic, subject, improvement) => 
      `📊 Great improvement! Your ${topic} score in ${subject} increased by ${improvement}% this week!`
  }
};

// src/middleware/notificationMiddleware.js
// Middleware to add notification service to request object
export const notificationMiddleware = (req, res, next) => {
  req.notificationService = NotificationService;
  next();
};

// src/utils/notificationUtils.js
// Utility functions for notifications
export class NotificationUtils {
  
  // Check if user has completed quiz today
  static async hasCompletedQuizToday(userId) {
    const result = await pool.query(
      `SELECT id FROM user_quiz_sessions 
       WHERE user_id = $1 AND DATE(created_at) = CURRENT_DATE AND finished_at IS NOT NULL`,
      [userId]
    );
    return result.rows.length > 0;
  }

  // Get user's active subjects
  static async getUserSubjects(userId) {
    const result = await pool.query(
      `SELECT s.id, s.subject 
       FROM users u
       JOIN subjects s ON s.id = ANY(u.selected_subjects)
       WHERE u.id = $1`,
      [userId]
    );
    return result.rows;
  }

  // Calculate user streak
  static async calculateStreak(userId) {
    const query = `
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
    
    const result = await pool.query(query, [userId]);
    return parseInt(result.rows[0]?.streak_days || 0);
  }

  // Get random subject from user's selections
  static getRandomSubject(subjects) {
    if (!subjects || subjects.length === 0) return null;
    return subjects[Math.floor(Math.random() * subjects.length)];
  }

  // Format notification time
  static formatNotificationTime(createdAt) {
    const now = new Date();
    const notificationTime = new Date(createdAt);
    const diffInMinutes = Math.floor((now - notificationTime) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    if (diffInMinutes < 10080) return `${Math.floor(diffInMinutes / 1440)}d ago`;
    return `${Math.floor(diffInMinutes / 10080)}w ago`;
  }
}