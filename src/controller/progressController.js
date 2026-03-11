import pool from "../../database.js";

// Get progress stats for a user

export const getProgressPageData = async (req, res) => {
  const userId = req.userId;

  try {
    // ======================================================
    // Run Independent Queries In Parallel
    // ======================================================
    const [
      totalRes,
      accuracyRes,
      trendRes,
      subjectPerfRes,
      recentActivityRes
    ] = await Promise.all([

      // 1️⃣ Total Questions Attempted
      pool.query(
        `SELECT COUNT(*)::int AS total_questions
         FROM user_answers a
         JOIN user_quiz_sessions s ON a.session_id = s.id
         WHERE s.user_id = $1`,
        [userId]
      ),

      // 2️⃣ Overall Accuracy
      pool.query(
        `SELECT ROUND(
            AVG(CASE WHEN a.is_correct THEN 1 ELSE 0 END) * 100, 1
          ) AS accuracy
         FROM user_answers a
         JOIN user_quiz_sessions s ON a.session_id = s.id
         WHERE s.user_id = $1`,
        [userId]
      ),

      // 3️⃣ 30 Day Accuracy Trend
      pool.query(
        `WITH days AS (
           SELECT generate_series(
             current_date - interval '29 days',
             current_date,
             '1 day'
           )::date AS day
         ),
         stats AS (
           SELECT DATE(a.answered_at) AS answered_day,
                  ROUND(
                    AVG(CASE WHEN a.is_correct THEN 1 ELSE 0 END) * 100, 1
                  ) AS daily_accuracy
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
      ),

      // 4️⃣ Subject Performance
      pool.query(
        `SELECT q.subject_id,
                ROUND(
                  AVG(CASE WHEN a.is_correct THEN 1 ELSE 0 END) * 100, 1
                ) AS accuracy
         FROM user_answers a
         JOIN user_quiz_sessions s ON a.session_id = s.id
         JOIN questions q ON a.question_id = q.id
         WHERE s.user_id = $1
         GROUP BY q.subject_id
         ORDER BY accuracy DESC`,
        [userId]
      ),

      // 5️⃣ Recent Activity
      pool.query(
        `SELECT id AS session_id,
                started_at,
                finished_at,
                score,
                total_questions
         FROM user_quiz_sessions
         WHERE user_id = $1
         ORDER BY finished_at DESC
         LIMIT 10`,
        [userId]
      )

    ]);

    return res.json({
      ok: true,
      totalQuestions: totalRes.rows[0]?.total_questions || 0,
      overallAccuracy: accuracyRes.rows[0]?.accuracy || 0,
      scoreTrend: trendRes.rows,
      performanceBySubject: subjectPerfRes.rows,
      recentActivity: recentActivityRes.rows
    });

  } catch (err) {
    console.error("Progress API Error:", err);
    return res.status(500).json({
      ok: false,
      message: "Server error"
    });
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

    // Daily Streak
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
      WHERE day = current_date - ((rn-1) * interval '1 day');`,
      [userId]
    );

    // ❌ Topic Breakdown (Disabled / Commented)
    /*
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
    */

    // 6. Weekly Points
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

      // ❌ Topic breakdown removed
      // topicBreakdown: [],

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
    // =====================================================
    // Common Date Filter Builder
    // =====================================================
    const buildDateClause = (column, startIndex = 2) => {
      if (start_date && end_date) {
        return {
          clause: `AND ${column} BETWEEN $${startIndex} AND $${startIndex + 1}`,
          params: [start_date, end_date],
        };
      }
      return { clause: "", params: [] };
    };

    // =====================================================
    // 1️⃣ Run Independent Queries In Parallel
    // =====================================================
    const [
      notesRes,
      quizzesTakenRes,
      miniQuizRes,
      monthlyAnalyticsRes,
      // topicBreakdownRes,
      weeklyStatsRes,
      streakRes
    ] = await Promise.all([

      // ---------------- NOTES ----------------
      pool.query(
        `SELECT COUNT(*)::int AS notes_accessed
         FROM notes_access
         WHERE user_id = $1`,
        [userId]
      ),

      // ---------------- TOTAL QUIZZES ----------------
      (() => {
        const { clause, params } = buildDateClause("finished_at");
        return pool.query(
          `SELECT COUNT(*)::int AS total_quizzes
           FROM user_quiz_sessions
           WHERE user_id = $1
             AND finished_at IS NOT NULL
             ${clause}`,
          [userId, ...params]
        );
      })(),

      // ---------------- MINI QUIZ ANALYTICS ----------------
      (() => {
        const { clause, params } = buildDateClause("s.finished_at");
        return pool.query(
          `SELECT 
              ROUND(AVG(EXTRACT(EPOCH FROM (a.answered_at - s.started_at)) 
              / NULLIF(s.total_questions,0)),1) AS avg_time,
              ROUND(AVG(CASE WHEN a.is_correct THEN 1 ELSE 0 END) * 100, 1) AS accuracy,
              (
                SELECT score 
                FROM user_quiz_sessions 
                WHERE user_id = $1
                  AND type = 'mini'
                  ${clause.replace("s.", "")}
                ORDER BY finished_at DESC
                LIMIT 1
              ) AS last_score
           FROM user_answers a
           JOIN user_quiz_sessions s ON a.session_id = s.id
           WHERE s.user_id = $1
             AND s.type = 'mini'
             ${clause}`,
          [userId, ...params]
        );
      })(),

      // ---------------- MONTHLY ANALYTICS ----------------
      pool.query(
        `WITH months AS (
           SELECT generate_series(
             date_trunc('year', CURRENT_DATE),
             date_trunc('year', CURRENT_DATE) + interval '11 months',
             '1 month'
           ) AS month
         ),
         data AS (
           SELECT date_trunc('month', finished_at) AS month,
                  SUM(score)::int AS score
           FROM user_quiz_sessions
           WHERE user_id = $1
             AND finished_at IS NOT NULL
             AND finished_at >= date_trunc('year', CURRENT_DATE)
           GROUP BY 1
         )
         SELECT to_char(m.month,'YYYY-MM') AS month,
                COALESCE(d.score,0) AS score
         FROM months m
         LEFT JOIN data d ON m.month = d.month
         ORDER BY m.month`,
        [userId]
      ),

      /*
      // ---------------- TOPIC BREAKDOWN ----------------
      (() => {
        const { clause, params } = buildDateClause("s.finished_at");
        let subjectFilter = "";
        let subjectParam = [];

        if (subject_id) {
          subjectFilter = `AND a.subject_id = $${params.length + 2}`;
          subjectParam = [subject_id];
        }

        return pool.query(
          `WITH combined AS (
             SELECT q.topic_id, q.subject_id,
                    (CASE WHEN a.is_correct THEN 1 ELSE 0 END)::int AS is_correct,
                    s.finished_at
             FROM user_answers a
             JOIN user_quiz_sessions s ON a.session_id = s.id
             JOIN questions q ON a.question_id = q.id
             WHERE s.user_id = $1
             ${clause}

             UNION ALL

             SELECT eq.topic_id, eq.subject_id,
                    (CASE WHEN e.is_correct THEN 1 ELSE 0 END)::int,
                    s.finished_at
             FROM editing_quiz_answers e
             JOIN editing_quiz eq ON e.quiz_id = eq.id
             JOIN user_quiz_sessions s ON e.session_id = s.id
             WHERE e.user_id = $1
             ${clause}
           )
           SELECT t.id AS topic_id,
                  t.topic,
                  sub.subject,
                  COUNT(*)::int AS answered,
                  ROUND(AVG(is_correct)*100,1) AS accuracy,
                  MAX(finished_at) AS last_attempt
           FROM combined a
           JOIN topics t ON t.id = a.topic_id
           LEFT JOIN subjects sub ON sub.id = a.subject_id
           WHERE 1=1
           ${subjectFilter}
           GROUP BY t.id, t.topic, sub.subject
           ORDER BY accuracy DESC`,
          [userId, ...params, ...subjectParam]
        );
      })(),
      */

      // ---------------- WEEKLY POINTS ----------------
      pool.query(
        `SELECT 
            COUNT(DISTINCT s.id)::int AS sessions,
            COALESCE(SUM(CASE WHEN a.is_correct THEN 1 ELSE 0 END),0)::int AS correct_normal,
            (
              SELECT COALESCE(SUM(CASE WHEN e.is_correct THEN 1 ELSE 0 END),0)
              FROM editing_quiz_answers e
              JOIN user_quiz_sessions s2 ON e.session_id = s2.id
              WHERE e.user_id = $1
                AND e.created_at >= date_trunc('week', CURRENT_DATE)
            )::int AS correct_editable
         FROM user_quiz_sessions s
         LEFT JOIN user_answers a ON a.session_id = s.id
         WHERE s.user_id = $1
           AND s.finished_at >= date_trunc('week', CURRENT_DATE)`,
        [userId]
      ),

      // ---------------- STREAK ----------------
      pool.query(
        `WITH dates AS (
           SELECT DISTINCT DATE(finished_at) d
           FROM user_quiz_sessions
           WHERE user_id = $1
             AND finished_at IS NOT NULL
             AND finished_at >= CURRENT_DATE - interval '6 days'
         ),
         grp AS (
           SELECT d,
             d - INTERVAL '1 day' *
             ROW_NUMBER() OVER (ORDER BY d) g
           FROM dates
         )
         SELECT MAX(COUNT(*)) OVER () AS max_streak
         FROM grp
         GROUP BY g`,
        [userId]
      )

    ]);

    // =====================================================
    // Compute Weekly Points
    // =====================================================
    const weekly = weeklyStatsRes.rows[0] || {};
    const weeklyPoints =
      (weekly.sessions || 0) * 10 +
      (weekly.correct_normal || 0) +
      (weekly.correct_editable || 0);

    // =====================================================
    // Response
    // =====================================================
    return res.json({
      ok: true,
      notesAccessed: notesRes.rows[0]?.notes_accessed || 0,
      quizzesTaken: quizzesTakenRes.rows[0]?.total_quizzes || 0,

      miniQuiz: miniQuizRes.rows[0] || {},

      monthlyQuiz: {
        chart: monthlyAnalyticsRes.rows
      },

      // topicBreakdown: topicBreakdownRes.rows,

      achievements: {
        weeklyGoal: { points: weeklyPoints, total: 100 },
        badges: {
          quizzesInWeek: (weekly.sessions || 0) >= 5,
          threeDayStreak:
            (streakRes.rows[0]?.max_streak || 0) >= 3,
        },
      },
    });

  } catch (err) {
    console.error("Progress API Error:", err);
    return res.status(500).json({
      ok: false,
      message: "Server error",
    });
  }
};