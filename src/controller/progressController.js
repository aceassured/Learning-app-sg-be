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

// get progress page data monthly....

export const getProgressPageDatawithMonthly = async (req, res) => {
  const userId = req.userId;
  const { subject_id, start_date, end_date } = req.query;

  try {
    // -----------------------------
    // 1) Notes Access (unchanged)
    // -----------------------------
    const notesRes = await pool.query(
      `SELECT COUNT(*)::int AS notes_accessed
       FROM notes_access
       WHERE user_id = $1`,
      [userId]
    );

    // -----------------------------
    // 2) Total Quizzes Taken - Count distinct sessions from user_quiz_sessions
    // -----------------------------
    const quizzesParams = [userId];
    let quizzesDateClause = "";
    if (start_date && end_date) {
      quizzesParams.push(start_date, end_date);
      quizzesDateClause = `AND finished_at BETWEEN $2 AND $3`;
    }

    const quizzesTakenRes = await pool.query(
      `SELECT COUNT(*)::int AS total_quizzes
       FROM user_quiz_sessions
       WHERE user_id = $1 AND finished_at IS NOT NULL
       ${quizzesDateClause}`,
      quizzesParams
    );

    const quizzesTaken = quizzesTakenRes.rows[0]?.total_quizzes || 0;

    // -----------------------------
    // 3) Mini Quiz Analytics (for mini type sessions only)
    // -----------------------------
    const miniParams = [userId];
    let miniDateClause = "";
    if (start_date && end_date) {
      miniParams.push(start_date, end_date);
      miniDateClause = `AND s.finished_at BETWEEN $2 AND $3`;
    }

    const lastScoreParams = [userId];
    let lastScoreDateClause = "";
    if (start_date && end_date) {
      lastScoreParams.push(start_date, end_date);
      lastScoreDateClause = `AND finished_at BETWEEN $2 AND $3`;
    }

    const miniQuizRes = await pool.query(
      `SELECT 
          ROUND(AVG(EXTRACT(EPOCH FROM (a.answered_at - s.started_at)) / NULLIF(s.total_questions,0)),1) AS avg_time,
          ROUND(AVG(CASE WHEN a.is_correct THEN 1 ELSE 0 END) * 100, 1) AS accuracy,
          (
            SELECT score 
            FROM user_quiz_sessions 
            WHERE user_id = $1
              AND type = 'mini'
              ${lastScoreDateClause}
            ORDER BY finished_at DESC
            LIMIT 1
          ) AS last_score
       FROM user_answers a
       JOIN user_quiz_sessions s ON a.session_id = s.id
       WHERE s.user_id = $1
         AND s.type = 'mini'
         ${miniDateClause}`,
      miniParams
    );

    // -----------------------------
    // 4) MONTHLY ANALYTICS - Get data for entire current year
    // -----------------------------
    const monthlyAnalyticsQuery = `
      WITH all_months AS (
        -- Generate all months for the current year
        SELECT to_char(generate_series(
          date_trunc('year', CURRENT_DATE),
          date_trunc('year', CURRENT_DATE) + INTERVAL '1 year - 1 day',
          '1 month'::interval
        ), 'YYYY-MM') AS month
      ),
      quiz_data AS (
        -- Get quiz scores for the current year
        SELECT 
          to_char(DATE_TRUNC('month', finished_at), 'YYYY-MM') AS month,
          SUM(score)::int AS score
        FROM user_quiz_sessions
        WHERE user_id = $1
          AND finished_at IS NOT NULL
          AND finished_at >= date_trunc('year', CURRENT_DATE)
          AND finished_at < date_trunc('year', CURRENT_DATE) + INTERVAL '1 year'
        GROUP BY DATE_TRUNC('month', finished_at)
      )
      SELECT 
        am.month,
        COALESCE(qd.score, 0) AS score
      FROM all_months am
      LEFT JOIN quiz_data qd ON am.month = qd.month
      ORDER BY am.month;
    `;

    const monthlyAnalyticsRes = await pool.query(monthlyAnalyticsQuery, [userId]);

    // -----------------------------
    // 5) TOPIC BREAKDOWN - Combine normal and editable answers from same sessions
    // -----------------------------
    const topicParams = [userId];
    let topicDateClause = "";
    if (start_date && end_date) {
      topicParams.push(start_date, end_date);
      topicDateClause = `AND finished_at BETWEEN $2 AND $3`;
    }

    if (subject_id) {
      topicParams.push(subject_id);
    }

    const topicBreakdownQuery = `
      WITH all_answers AS (
        -- normal answers from questions
        SELECT
          q.topic_id::int AS topic_id,
          q.subject_id::int AS subject_id,
          (CASE WHEN a.is_correct THEN 1 ELSE 0 END)::int AS is_correct,
          s.finished_at::timestamp AS finished_at
        FROM user_answers a
        JOIN user_quiz_sessions s ON a.session_id = s.id
        JOIN questions q ON a.question_id = q.id
        WHERE s.user_id = $1
          ${start_date && end_date ? `AND s.finished_at BETWEEN $2 AND $3` : ""}

        UNION ALL

        -- editable answers from editing quizzes
        SELECT
          eq.topic_id::int AS topic_id,
          eq.subject_id::int AS subject_id,
          (CASE WHEN e.is_correct THEN 1 ELSE 0 END)::int AS is_correct,
          s.finished_at::timestamp AS finished_at
        FROM editing_quiz_answers e
        JOIN editing_quiz eq ON e.quiz_id = eq.id
        JOIN user_quiz_sessions s ON e.session_id = s.id
        WHERE e.user_id = $1
          ${start_date && end_date ? `AND s.finished_at BETWEEN $2 AND $3` : ""}
      )

      SELECT
        t.id AS topic_id,
        t.topic AS topic,
        sub.subject AS subject,
        COUNT(a.*)::int AS questions_answered,
        ROUND(AVG(a.is_correct::int)::numeric * 100, 1) AS accuracy,
        MAX(a.finished_at) AS last_attempt
      FROM all_answers a
      JOIN topics t ON t.id = a.topic_id
      LEFT JOIN subjects sub ON sub.id = a.subject_id
      WHERE 1=1
        ${subject_id ? `AND a.subject_id = $${topicParams.length}` : ""}
      GROUP BY t.id, t.topic, sub.subject
      ORDER BY accuracy DESC;
    `;

    const topicBreakdownRes = await pool.query(topicBreakdownQuery, topicParams);

    // -----------------------------
    // 6) Weekly Points - Based on sessions and correct answers from both types
    // -----------------------------
    const normalThisWeekRes = await pool.query(
      `SELECT COUNT(DISTINCT id)::int AS normal_sessions
       FROM user_quiz_sessions
       WHERE user_id = $1
         AND finished_at IS NOT NULL
         AND finished_at >= date_trunc('week', CURRENT_DATE)`,
      [userId]
    );

    // Correct answers from normal questions this week
    const normalCorrectThisWeekRes = await pool.query(
      `SELECT COALESCE(SUM(CASE WHEN a.is_correct THEN 1 ELSE 0 END),0)::int AS correct_normal
       FROM user_answers a
       JOIN user_quiz_sessions s ON a.session_id = s.id
       WHERE s.user_id = $1
         AND a.answered_at >= date_trunc('week', CURRENT_DATE)`,
      [userId]
    );

    // Correct answers from editable questions this week
    const editableCorrectThisWeekRes = await pool.query(
      `SELECT COALESCE(SUM(CASE WHEN e.is_correct THEN 1 ELSE 0 END),0)::int AS correct_editable
       FROM editing_quiz_answers e
       JOIN user_quiz_sessions s ON e.session_id = s.id
       WHERE e.user_id = $1
         AND e.created_at >= date_trunc('week', CURRENT_DATE)`,
      [userId]
    );

    const weeklyPoints =
      (normalThisWeekRes.rows[0]?.normal_sessions || 0) * 10 +
      (normalCorrectThisWeekRes.rows[0]?.correct_normal || 0) +
      (editableCorrectThisWeekRes.rows[0]?.correct_editable || 0);

    // -----------------------------
    // 7) Quizzes in Week Achievement (>=5)
    // -----------------------------
    const quizzesInWeekRes = await pool.query(
      `SELECT COUNT(*)::int AS quizzes_this_week
       FROM user_quiz_sessions
       WHERE user_id = $1
         AND finished_at IS NOT NULL
         AND finished_at >= date_trunc('week', CURRENT_DATE)`,
      [userId]
    );

    const quizzesInWeekCount = quizzesInWeekRes.rows[0]?.quizzes_this_week || 0;

    // -----------------------------
    // 8) 3 Days Continuous Streak Badge
    //    Check if user has completed quizzes for 3 consecutive days including today
    // -----------------------------
    const streakRes = await pool.query(
      `WITH quiz_dates AS (
        SELECT DISTINCT DATE(finished_at) AS activity_date
        FROM user_quiz_sessions 
        WHERE user_id = $1 
          AND finished_at IS NOT NULL
          AND finished_at >= CURRENT_DATE - INTERVAL '6 days'
      ),
      consecutive_groups AS (
        SELECT 
          activity_date,
          activity_date - INTERVAL '1 day' * 
            ROW_NUMBER() OVER (ORDER BY activity_date) AS grp
        FROM quiz_dates
      ),
      consecutive_counts AS (
        SELECT 
          grp,
          COUNT(*) AS consecutive_days,
          MIN(activity_date) AS start_date,
          MAX(activity_date) AS end_date
        FROM consecutive_groups
        GROUP BY grp
      )
      SELECT MAX(consecutive_days) AS max_streak
      FROM consecutive_counts
      WHERE end_date >= CURRENT_DATE - INTERVAL '1 day'`,
      [userId]
    );

    const hasThreeDayStreak = streakRes.rows[0]?.max_streak >= 3;

    // -----------------------------
    // Build response
    // -----------------------------
    res.json({
      ok: true,
      subjectId: subject_id || null,
      dateRange: {
        start_date: start_date || null,
        end_date: end_date || null,
      },

      notesAccessed: notesRes.rows[0]?.notes_accessed || 0,
      quizzesTaken,

      miniQuiz: {
        avgTime: miniQuizRes.rows[0]?.avg_time || 0,
        accuracy: miniQuizRes.rows[0]?.accuracy || 0,
        lastScore: miniQuizRes.rows[0]?.last_score || 0,
      },

      monthlyQuiz: {
        chart: monthlyAnalyticsRes.rows.map((r) => ({
          month: r.month,
          score: r.score,
        })),
      },

      topicBreakdown: topicBreakdownRes.rows.map((r) => ({
        topicId: r.topic_id,
        topic: r.topic,
        subject: r.subject,
        answered: r.questions_answered,
        accuracy: r.accuracy,
        lastAttempt: r.last_attempt,
      })),

      achievements: {
        weeklyGoal: {
          points: weeklyPoints,
          total: 100,
        },
        badges: {
          quizzesInWeek: quizzesInWeekCount >= 5,
          threeDayStreak: hasThreeDayStreak,
        },
      },
    });
  } catch (err) {
    console.error("Error in getProgressPageDatawithMonthly:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};