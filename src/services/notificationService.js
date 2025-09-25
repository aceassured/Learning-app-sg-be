// src/services/notificationService.js
import pool from '../../database.js';
import { io } from "../../index.js";

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
            // Check if user already has a quiz notification today
            const exists = await this.notificationExistsForToday(userId, 'quiz');
            if (exists) return;

            // Check if user completed a session today
            const todaySession = await pool.query(
                `SELECT id FROM user_quiz_sessions 
         WHERE user_id = $1 AND DATE(created_at) = CURRENT_DATE AND finished_at IS NOT NULL`,
                [userId]
            );

            if (todaySession.rows.length > 0) return; // User already completed today's quiz

            // Get user's selected subjects
            const userResult = await pool.query(
                'SELECT selected_subjects FROM users WHERE id = $1',
                [userId]
            );

            if (!userResult.rows[0]?.selected_subjects?.length) return;

            // Get random subject from user's selected subjects
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
            // Check if user already has a streak notification today
            const exists = await this.notificationExistsForToday(userId, 'streak');
            if (exists) return;

            // Calculate streak: consecutive days with completed sessions
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

            if (streakDays >= 3) { // Only notify for streaks of 3+ days
                // Get user's most active subject for the streak message
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

    // 3. Progress Notification (After Quiz Completion)
    static async createProgressNotification(userId, sessionId) {
        try {
            // Get session details including topic & subject
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

            // Calculate user's performance in this topic (last 10 attempts)
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
                return; // Don't send notification for low scores with few attempts
            }

            // Check if similar progress notification exists today for this subject
            const exists = await this.notificationExistsForToday(userId, 'progress', session.subject);
            if (!exists) {
                await this.insertNotification(userId, message, 'progress', session.subject);
            }

        } catch (error) {
            console.error("Error creating progress notification:", error);
        }
    }


    // 4. Forum Comments Notification
    static async createForumCommentsNotification(userId) {
        try {
            // Check if user already has a forum notification today
            const exists = await this.notificationExistsForToday(userId, 'forum');
            if (exists) return;

            // Get user's forum posts and recent comments
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
            // Check if combined with comments notification
            const exists = await this.notificationExistsForToday(userId, 'forum');
            if (exists) return;

            // Get user's forum posts and recent likes
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

    // 6. Weekly High Score Notification
    // 6. Weekly High Score Notification
    static async createWeeklyHighScoreNotification(userId) {
        try {
            // Check if user already has a weekly notification
            const exists = await this.notificationExistsForWeek(userId, "weekly_progress");
            if (exists) return;

            // Get user's best performance this week by subject
            const weeklyScore = await pool.query(
                `
      SELECT 
        s.subject,
        AVG(CASE WHEN ua.is_correct THEN 1.0 ELSE 0.0 END) * 100 AS avg_score,
        COUNT(ua.id) AS total_questions
      FROM user_quiz_sessions uqs
      JOIN user_answers ua 
        ON ua.session_id = uqs.id
      JOIN questions q 
        ON q.id = ua.question_id
      JOIN topics t 
        ON t.id = q.topic_id
      JOIN subjects s 
        ON s.id = t.subject_id
      WHERE uqs.user_id = $1
        AND uqs.created_at >= CURRENT_DATE - INTERVAL '7 days'
        AND uqs.finished_at IS NOT NULL
      GROUP BY s.id, s.subject
      HAVING COUNT(ua.id) >= 10
      ORDER BY avg_score DESC
      LIMIT 1
      `,
                [userId]
            );

            if (weeklyScore.rows.length > 0) {
                const { subject, avg_score } = weeklyScore.rows[0];
                const percentage = Math.round(avg_score);

                if (percentage >= 75) {
                    const message = `🌟 This week's highlight: ${percentage}% average in ${subject}! You're on fire!`;
                    await this.insertNotification(userId, message, "weekly_progress", subject);
                }
            }
        } catch (error) {
            console.error("Error creating weekly high score notification:", error);
        }
    }



    // 7. Topic Improvement Notification
    static async createTopicImprovementNotification(userId) {
        try {
            // Check if user already has improvement notification this week
            const exists = await this.notificationExistsForWeek(userId, "improvement");
            if (exists) return;

            const improvementQuery = `
WITH topic_scores AS (
  SELECT 
    t.id AS topic_id,
    t.topic AS topic_name,
    s.subject,
    CASE 
      WHEN uqs.created_at >= CURRENT_DATE - INTERVAL '7 days' THEN 'this_week'
      WHEN uqs.created_at >= CURRENT_DATE - INTERVAL '14 days' THEN 'last_week'
    END AS period,
    AVG(CASE WHEN ua.is_correct THEN 1.0 ELSE 0.0 END) * 100 AS avg_score
  FROM user_quiz_sessions uqs
  JOIN user_answers ua 
    ON ua.session_id = uqs.id
  JOIN questions q 
    ON q.id = ua.question_id
  JOIN topics t 
    ON t.id = q.topic_id
  JOIN subjects s 
    ON s.id = t.subject_id
  WHERE uqs.user_id = $1 
    AND uqs.created_at >= CURRENT_DATE - INTERVAL '14 days'
    AND uqs.finished_at IS NOT NULL
  GROUP BY t.id, t.topic, s.subject, period
  HAVING COUNT(ua.id) >= 5
)
SELECT 
  topic_name,
  subject,
  MAX(CASE WHEN period = 'this_week' THEN avg_score END) AS this_week_score,
  MAX(CASE WHEN period = 'last_week' THEN avg_score END) AS last_week_score
FROM topic_scores
GROUP BY topic_id, topic_name, subject
HAVING 
  MAX(CASE WHEN period = 'this_week' THEN avg_score END) IS NOT NULL
  AND MAX(CASE WHEN period = 'last_week' THEN avg_score END) IS NOT NULL
  AND MAX(CASE WHEN period = 'this_week' THEN avg_score END) > 
      MAX(CASE WHEN period = 'last_week' THEN avg_score END) + 10
ORDER BY (MAX(CASE WHEN period = 'this_week' THEN avg_score END) - 
          MAX(CASE WHEN period = 'last_week' THEN avg_score END)) DESC
LIMIT 1;

    `;

            const improvementResult = await pool.query(improvementQuery, [userId]);

            if (improvementResult.rows.length > 0) {
                const { topic_name, subject, this_week_score, last_week_score } =
                    improvementResult.rows[0];

                const improvement = Math.round(this_week_score - last_week_score);

                const message = `📊 Great improvement! Your ${topic_name} score in ${subject} increased by ${improvement}% this week!`;
                await this.insertNotification(userId, message, "improvement", subject);
            }
        } catch (error) {
            console.error("Error creating topic improvement notification:", error);
        }
    }


    // Main function to generate all login notifications
    static async generateLoginNotifications(userId) {
        try {
            console.log(`🔔 Generating notifications for user ${userId}`);

            // Daily notifications
            await this.createDailyQuizNotification(userId);
            await this.createStreakNotification(userId);
            await this.createForumCommentsNotification(userId);
            await this.createForumLikesNotification(userId);

            // Weekly notifications (only once per week)
            await this.createWeeklyHighScoreNotification(userId);
            await this.createTopicImprovementNotification(userId);

            console.log(`✅ Notifications generated for user ${userId}`);
        } catch (error) {
            console.error("Error generating login notifications:", error);
        }
    }

    // Function to call after quiz completion
    static async generateQuizCompletionNotifications(userId, sessionId) {
        try {
            await this.createProgressNotification(userId, sessionId);
        } catch (error) {
            console.error("Error generating quiz completion notifications:", error);
        }
    }
}