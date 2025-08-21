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
