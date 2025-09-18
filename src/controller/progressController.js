import pool from "../../database.js";

// Get progress stats for a user

export const getProgressPageData = async (req, res) => {
  const userId = req.userId;

  try {
    const totalRes = await pool.query(
      `SELECT COUNT(a.*)::int AS total_questions
       FROM user_answers a
       JOIN user_quiz_sessions s ON a.session_id = s.id
       WHERE s.user_id = $1`,
      [userId]
    );

    const accuracyRes = await pool.query(
      `SELECT ROUND(AVG(CASE WHEN a.is_correct THEN 1 ELSE 0 END) * 100, 1) AS accuracy
       FROM user_answers a
       JOIN user_quiz_sessions s ON a.session_id = s.id
       WHERE s.user_id = $1`,
      [userId]
    );

    const trendRes = await pool.query(
      `WITH days AS (
         SELECT generate_series::date AS day
         FROM generate_series(
           current_date - interval '29 days',
           current_date,
           '1 day'
         )
       ),
       stats AS (
         SELECT DATE_TRUNC('day', a.answered_at)::date AS answered_day,
                ROUND(AVG(CASE WHEN a.is_correct THEN 1 ELSE 0 END) * 100, 1) AS daily_accuracy
         FROM user_answers a
         JOIN user_quiz_sessions s ON a.session_id = s.id
         WHERE s.user_id = $1
           AND a.answered_at >= current_date - interval '30 days'
         GROUP BY answered_day
       )
       SELECT d.day,
              COALESCE(s.daily_accuracy, 0) AS accuracy
       FROM days d
       LEFT JOIN stats s ON d.day = s.answered_day
       ORDER BY d.day`,
      [userId]
    );
    const subjectPerfRes = await pool.query(
      `SELECT q.subject,
              ROUND(AVG(CASE WHEN a.is_correct THEN 1 ELSE 0 END) * 100, 1) AS accuracy
       FROM user_answers a
       JOIN user_quiz_sessions s ON a.session_id = s.id
       JOIN questions q ON a.question_id = q.id
       WHERE s.user_id = $1
       GROUP BY q.subject
       ORDER BY accuracy DESC`,
      [userId]
    );

    const recentActivityRes = await pool.query(
      `SELECT s.id AS session_id,
              s.started_at,
              s.finished_at,
              s.score,
              s.total_questions
       FROM user_quiz_sessions s
       WHERE s.user_id = $1
       ORDER BY s.finished_at DESC
       LIMIT 10`,
      [userId]
    );

    res.json({
      ok: true,
      totalQuestions: totalRes.rows[0]?.total_questions || 0,
      overallAccuracy: accuracyRes.rows[0]?.accuracy || 0,
      scoreTrend: trendRes.rows,
      performanceBySubject: subjectPerfRes.rows,
      recentActivity: recentActivityRes.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};


// new analytics page...........


export const getProgressPageDatanew = async (req, res) => {
  const userId = req.userId;
  const { subject_id } = req.query; // optional filter

  try {
    // 1. Notes Accessed (from notes_access table)
    const notesRes = await pool.query(
      `SELECT COUNT(*)::int AS notes_accessed
       FROM notes_access
       WHERE user_id = $1`,
      [userId]
    );

    // 2. Quizzes Completed
    const quizzesRes = await pool.query(
      `SELECT COUNT(*)::int AS quizzes_taken
       FROM user_quiz_sessions
       WHERE user_id = $1`,
      [userId]
    );

    // 3. Mini Quiz Analytics
    const miniQuizRes = await pool.query(
      `SELECT 
          ROUND(AVG(EXTRACT(EPOCH FROM (a.answered_at - s.started_at)) / NULLIF(s.total_questions,0)),1) AS avg_time,
          ROUND(AVG(CASE WHEN a.is_correct THEN 1 ELSE 0 END) * 100, 1) AS accuracy,
          (SELECT score 
           FROM user_quiz_sessions 
           WHERE user_id = $1 AND type='mini'
           ORDER BY finished_at DESC LIMIT 1) AS last_score
       FROM user_answers a
       JOIN user_quiz_sessions s ON a.session_id = s.id
       WHERE s.user_id = $1 AND s.type='mini'`,
      [userId]
    );

    // 4. Daily Quiz (last 7 days)
    const dailyQuizRes = await pool.query(
      `WITH days AS (
         SELECT generate_series::date AS day
         FROM generate_series(current_date - interval '6 days', current_date, '1 day')
       ),
       stats AS (
         SELECT DATE_TRUNC('day', s.finished_at)::date AS quiz_day,
                AVG(s.score)::int AS avg_score
         FROM user_quiz_sessions s
         WHERE s.user_id = $1 AND s.type='daily'
           AND s.finished_at >= current_date - interval '6 days'
         GROUP BY quiz_day
       )
       SELECT d.day,
              COALESCE(s.avg_score, 0) AS score
       FROM days d
       LEFT JOIN stats s ON d.day = s.quiz_day
       ORDER BY d.day`,
      [userId]
    );

    // Daily Streak (consecutive daily quiz days)
    const streakRes = await pool.query(
      `WITH user_days AS (
   SELECT DISTINCT DATE_TRUNC('day', finished_at)::date AS day
   FROM user_quiz_sessions
   WHERE user_id = $1 AND type='daily'
     AND finished_at >= current_date - interval '30 days'
)
SELECT COUNT(*) AS streak
FROM (
   SELECT day,
          ROW_NUMBER() OVER (ORDER BY day DESC) AS rn
   FROM user_days
   WHERE day <= current_date
) t
WHERE day = current_date - ((rn-1) * interval '1 day');
`,
      [userId]
    );

    // 5. Topic Breakdown (per subject, optional filter)
    const topicBreakdownRes = await pool.query(
      `SELECT t.id AS topic_id,
              t.topic AS topic,
              q.subject AS subject,
              COUNT(a.*)::int AS questions_answered,
              ROUND(AVG(CASE WHEN a.is_correct THEN 1 ELSE 0 END) * 100, 1) AS accuracy,
              MAX(s.finished_at) AS last_attempt
       FROM user_answers a
       JOIN user_quiz_sessions s ON a.session_id = s.id
       JOIN questions q ON a.question_id = q.id
       JOIN topics t ON q.topic_id = t.id
       WHERE s.user_id = $1
         ${subject_id ? "AND q.subject_id = $2" : ""}
       GROUP BY t.id, t.topic, q.subject
       ORDER BY accuracy DESC`,
      subject_id ? [userId, subject_id] : [userId]
    );

    // 6. Weekly Points (Achievements)
    const weeklyPointsRes = await pool.query(
      `SELECT COALESCE(
          COUNT(DISTINCT s.id) * 10 + SUM(CASE WHEN a.is_correct THEN 1 ELSE 0 END),
          0
        ) AS points
       FROM user_answers a
       JOIN user_quiz_sessions s ON a.session_id = s.id
       WHERE s.user_id = $1
         AND s.started_at >= date_trunc('week', CURRENT_DATE)`,
      [userId]
    );

    // 7. 5 Quizzes in Week Achievement
    const quizzesInWeekRes = await pool.query(
      `SELECT COUNT(*)::int AS weekly_quizzes
       FROM user_quiz_sessions
       WHERE user_id = $1
         AND type='daily'
         AND started_at >= date_trunc('week', CURRENT_DATE)`,
      [userId]
    );

    res.json({
      ok: true,
      subjectId: subject_id || null,
      notesAccessed: notesRes.rows[0]?.notes_accessed || 0,
      quizzesTaken: quizzesRes.rows[0]?.quizzes_taken || 0,
      miniQuiz: {
        avgTime: miniQuizRes.rows[0]?.avg_time || 0,
        accuracy: miniQuizRes.rows[0]?.accuracy || 0,
        lastScore: miniQuizRes.rows[0]?.last_score || 0,
      },
      dailyQuiz: {
        streak: streakRes.rows[0]?.streak || 0,
        chart: dailyQuizRes.rows.map(r => ({
          day: r.day,
          score: r.score
        }))
      },
      topicBreakdown: topicBreakdownRes.rows.map(r => ({
        topicId: r.topic_id,
        topic: r.topic,
        subject: r.subject,
        answered: r.questions_answered,
        accuracy: r.accuracy,
        lastAttempt: r.last_attempt
      })),
      achievements: {
        weeklyGoal: {
          points: weeklyPointsRes.rows[0]?.points || 0,
          total: 100
        },
        badges: {
          quizzesInWeek: quizzesInWeekRes.rows[0]?.weekly_quizzes >= 5,
          streak3Days: (streakRes.rows[0]?.streak || 0) >= 3
        }
      }
    });

  } catch (err) {
    console.error("Error in getProgressPageData:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};
