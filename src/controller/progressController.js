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

// new progress analytics with monthly data........

// export const getProgressPageDatawithMonthly = async (req, res) => {
//   const userId = req.userId;
//   const { subject_id, start_date, end_date } = req.query;

//   try {
//     // -----------------------------------
//     // DATE FILTER
//     // -----------------------------------
//     let dateFilter = "";
//     let params = [userId];

//     if (start_date && end_date) {
//       params.push(start_date, end_date);
//       dateFilter = `AND s.finished_at BETWEEN $${params.length - 1} AND $${params.length}`;
//     }

//     // -----------------------------------
//     // 1. Notes Access
//     // -----------------------------------
//     const notesRes = await pool.query(
//       `SELECT COUNT(*)::int AS notes_accessed
//        FROM notes_access
//        WHERE user_id = $1`,
//       [userId]
//     );

//     // -----------------------------------
//     // 2. Total Quizzes Taken
//     // -----------------------------------
//     const quizzesRes = await pool.query(
//       `SELECT COUNT(*)::int AS quizzes_taken
//        FROM user_quiz_sessions s
//        WHERE s.user_id = $1
//        ${dateFilter}`,
//       params
//     );

//     // -----------------------------------
//     // 3. Mini Quiz Analytics
//     // -----------------------------------
//     const miniQuizRes = await pool.query(
//       `SELECT 
//           ROUND(AVG(EXTRACT(EPOCH FROM (a.answered_at - s.started_at)) 
//             / NULLIF(s.total_questions,0)),1) AS avg_time,
//           ROUND(AVG(CASE WHEN a.is_correct THEN 1 ELSE 0 END) * 100, 1) AS accuracy,
//           (
//             SELECT score 
//             FROM user_quiz_sessions 
//             WHERE user_id = $1 
//               AND type = 'mini'
//               ${dateFilter}
//             ORDER BY finished_at DESC 
//             LIMIT 1
//           ) AS last_score
//        FROM user_answers a
//        JOIN user_quiz_sessions s ON a.session_id = s.id
//        WHERE s.user_id = $1
//          AND s.type = 'mini'
//        ${dateFilter}`,
//       params
//     );

//     // -----------------------------------
//     // 4. MONTHLY ANALYTICS (FIXED)
//     // -----------------------------------
//     const monthlyAnalyticsQuery = `
//       WITH monthly_scores AS (
//         SELECT 
//           DATE_TRUNC('month', finished_at)::date AS month,
//           SUM(score) AS total_score
//         FROM user_quiz_sessions 
//         WHERE user_id = $1
//           AND type IN ('mini', 'mixed', 'editing')
//         GROUP BY DATE_TRUNC('month', finished_at)
//         ORDER BY month ASC
//       )
//       SELECT 
//         to_char(month, 'YYYY-MM') AS month,
//         COALESCE(total_score, 0) AS score
//       FROM monthly_scores;
//     `;

//     const monthlyAnalyticsRes = await pool.query(monthlyAnalyticsQuery, [userId]);

//     // -----------------------------------
//     // 5. Topic Breakdown
//     // -----------------------------------
//     let topicParams = [...params];

//     const subjectCondition = subject_id
//       ? `AND q.subject_id = $${topicParams.length + 1}`
//       : "";

//     if (subject_id) topicParams.push(subject_id);

//     const topicBreakdownRes = await pool.query(
//       `SELECT t.id AS topic_id,
//               t.topic AS topic,
//               q.subject AS subject,
//               COUNT(a.*)::int AS questions_answered,
//               ROUND(AVG(CASE WHEN a.is_correct THEN 1 ELSE 0 END) * 100, 1) AS accuracy,
//               MAX(s.finished_at) AS last_attempt
//        FROM user_answers a
//        JOIN user_quiz_sessions s ON a.session_id = s.id
//        JOIN questions q ON a.question_id = q.id
//        JOIN topics t ON q.topic_id = t.id
//        WHERE s.user_id = $1
//          ${subjectCondition}
//          ${dateFilter}
//        GROUP BY t.id, t.topic, q.subject
//        ORDER BY accuracy DESC`,
//       topicParams
//     );

//     // -----------------------------------
//     // 6. Weekly Points
//     // -----------------------------------
//     const weeklyPointsRes = await pool.query(
//       `SELECT COALESCE(
//           COUNT(DISTINCT s.id) * 10 + SUM(CASE WHEN a.is_correct THEN 1 ELSE 0 END),
//           0
//         ) AS points
//        FROM user_answers a
//        JOIN user_quiz_sessions s ON a.session_id = s.id
//        WHERE s.user_id = $1
//          AND s.started_at >= date_trunc('week', CURRENT_DATE)`,
//       [userId]
//     );

//     // -----------------------------------
//     // 7. 5 Quizzes in Week Achievement
//     // -----------------------------------
//     const quizzesInWeekRes = await pool.query(
//       `SELECT COUNT(*)::int AS weekly_quizzes
//        FROM user_quiz_sessions
//        WHERE user_id = $1
//          AND started_at >= date_trunc('week', CURRENT_DATE)`,
//       [userId]
//     );

//     // -----------------------------------
//     // SEND RESPONSE
//     // -----------------------------------
//     res.json({
//       ok: true,
//       subjectId: subject_id || null,
//       dateRange: {
//         start_date: start_date || null,
//         end_date: end_date || null,
//       },

//       notesAccessed: notesRes.rows[0]?.notes_accessed || 0,
//       quizzesTaken: quizzesRes.rows[0]?.quizzes_taken || 0,

//       miniQuiz: {
//         avgTime: miniQuizRes.rows[0]?.avg_time || 0,
//         accuracy: miniQuizRes.rows[0]?.accuracy || 0,
//         lastScore: miniQuizRes.rows[0]?.last_score || 0,
//       },

//       monthlyQuiz: {
//         chart: monthlyAnalyticsRes.rows.map(r => ({
//           month: r.month,
//           score: r.score,
//         })),
//       },

//       topicBreakdown: topicBreakdownRes.rows.map(r => ({
//         topicId: r.topic_id,
//         topic: r.topic,
//         subject: r.subject,
//         answered: r.questions_answered,
//         accuracy: r.accuracy,
//         lastAttempt: r.last_attempt,
//       })),

//       achievements: {
//         weeklyGoal: {
//           points: weeklyPointsRes.rows[0]?.points || 0,
//           total: 100,
//         },
//         badges: {
//           quizzesInWeek: quizzesInWeekRes.rows[0]?.weekly_quizzes >= 5,
//         },
//       },
//     });

//   } catch (err) {
//     console.error("Error in getProgressPageData:", err);
//     res.status(500).json({ ok: false, message: "Server error" });
//   }
// };


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
    // 2) Total Quizzes Taken
    //    - normal sessions (user_quiz_sessions)
    //    - editable sessions: count distinct session_id from editing_quiz_answers
    // -----------------------------
    // normal quizzes (with optional date range)
    const quizzesParams = [userId];
    let quizzesDateClause = "";
    if (start_date && end_date) {
      quizzesParams.push(start_date, end_date);
      quizzesDateClause = `AND finished_at BETWEEN $2 AND $3`;
    }

    const normalQuizzesRes = await pool.query(
      `SELECT COUNT(*)::int AS normal_count
       FROM user_quiz_sessions
       WHERE user_id = $1
       ${quizzesDateClause}`,
      quizzesParams
    );

    // editable quiz sessions (distinct session_id) from editing_quiz_answers
    const editableParams = [userId];
    let editableDateClause = "";
    if (start_date && end_date) {
      editableParams.push(start_date, end_date);
      editableDateClause = `AND created_at BETWEEN $2 AND $3`;
    }

    const editableSessionsRes = await pool.query(
      `SELECT COUNT(DISTINCT session_id)::int AS editable_sessions
       FROM editing_quiz_answers
       WHERE user_id = $1
       ${editableDateClause}`,
      editableParams
    );

    const quizzesTaken =
      (normalQuizzesRes.rows[0]?.normal_count || 0) +
      (editableSessionsRes.rows[0]?.editable_sessions || 0);

    // -----------------------------
    // 3) Mini Quiz Analytics (normal only)
    //    - avg time per question
    //    - accuracy
    //    - last_score for mini (avoid referencing outer alias in subquery)
    // -----------------------------
    // build mini date filter params separately
    const miniParams = [userId];
    let miniDateClause = "";
    if (start_date && end_date) {
      miniParams.push(start_date, end_date);
      miniDateClause = `AND s.finished_at BETWEEN $2 AND $3`;
    }

    // last_score subquery gets its own date params (if provided)
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
    // 4) MONTHLY ANALYTICS (combine sources)
    //    - from user_quiz_sessions: use score column, finished_at
    //    - from editing_quiz_answers: compute per-editable-session score as count of correct answers,
    //      use created_at (or session created_at if available) grouped by month
    // -----------------------------
    // We'll union the two sources by month and sum them
    const monthlyParams = [userId];
    let monthlyEditableDateClause = "";
    let monthlyNormalDateClause = "";
    if (start_date && end_date) {
      // We'll apply same date range to both sources (normal: finished_at, editable: created_at)
      monthlyParams.push(start_date, end_date);
      monthlyNormalDateClause = `AND u.finished_at BETWEEN $2 AND $3`;
      monthlyEditableDateClause = `AND e.created_at BETWEEN $2 AND $3`;
    }

    const monthlyAnalyticsQuery = `
      WITH normal_month AS (
        SELECT DATE_TRUNC('month', u.finished_at)::date AS month,
               COALESCE(u.score,0) AS score
        FROM user_quiz_sessions u
        WHERE u.user_id = $1
          ${monthlyNormalDateClause}
          AND u.type IN ('mini','mixed','editing')
      ),
      editable_month AS (
        SELECT DATE_TRUNC('month', e.created_at)::date AS month,
               SUM(CASE WHEN e.is_correct THEN 1 ELSE 0 END)::int AS score
        FROM editing_quiz_answers e
        WHERE e.user_id = $1
          ${monthlyEditableDateClause}
        GROUP BY DATE_TRUNC('month', e.created_at)
      ),
      combined AS (
        SELECT month, SUM(score)::int AS score
        FROM (
          SELECT month, score FROM normal_month
          UNION ALL
          SELECT month, score FROM editable_month
        ) t
        GROUP BY month
        ORDER BY month
      )
      SELECT to_char(month, 'YYYY-MM') AS month, score FROM combined;
    `;

    const monthlyAnalyticsRes = await pool.query(monthlyAnalyticsQuery, monthlyParams);

    // -----------------------------
    // 5) TOPIC BREAKDOWN
    //    - we need topics (topic_id) that the user answered from both normal and editable quizzes
    //    - normalize both sources into a single CTE "all_answers" with columns:
    //        topic_id, subject_id, is_correct, finished_at
    //    - then aggregate per topic
    // -----------------------------
    // Build topic query params (we'll pass userId, optional start/end, optional subject_id)
    const topicParams = [userId];
    let topicExtraIndex = 2; // next param index if start/end present
    let topicDateClause = "";
    if (start_date && end_date) {
      topicParams.push(start_date, end_date);
      topicDateClause = `AND finished_at BETWEEN $2 AND $3`;
      topicExtraIndex = 4; // if subject_id also provided, it will be at $4
    }

    if (subject_id) {
      topicParams.push(subject_id);
    }

    // We'll create the combined answers CTE: normal answers + editable answers
    const topicBreakdownQuery = `
      WITH all_answers AS (
        -- normal answers
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

        -- editable answers
        SELECT
          eq.topic_id::int AS topic_id,
          eq.subject_id::int AS subject_id,
          (CASE WHEN e.is_correct THEN 1 ELSE 0 END)::int AS is_correct,
          e.created_at::timestamp AS finished_at
        FROM editing_quiz_answers e
        JOIN editing_quiz eq ON e.quiz_id = eq.id
        WHERE e.user_id = $1
          ${start_date && end_date ? `AND e.created_at BETWEEN $2 AND $3` : ""}
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
    // 6) Weekly Points
    //    - sum of: (distinct normal sessions this week)*10 + correct answers this week (normal + editable)
    // -----------------------------
    // normal sessions count this week
    const normalThisWeekRes = await pool.query(
      `SELECT COUNT(DISTINCT id)::int AS normal_sessions
       FROM user_quiz_sessions
       WHERE user_id = $1
         AND started_at >= date_trunc('week', CURRENT_DATE)`,
      [userId]
    );

    // correct answers from normal user_answers this week
    const normalCorrectThisWeekRes = await pool.query(
      `SELECT COALESCE(SUM(CASE WHEN a.is_correct THEN 1 ELSE 0 END),0)::int AS correct_normal
       FROM user_answers a
       JOIN user_quiz_sessions s ON a.session_id = s.id
       WHERE s.user_id = $1
         AND a.answered_at >= date_trunc('week', CURRENT_DATE)`,
      [userId]
    );

    // correct answers from editable quizzes this week
    const editableCorrectThisWeekRes = await pool.query(
      `SELECT COALESCE(SUM(CASE WHEN is_correct THEN 1 ELSE 0 END),0)::int AS correct_editable
       FROM editing_quiz_answers
       WHERE user_id = $1
         AND created_at >= date_trunc('week', CURRENT_DATE)`,
      [userId]
    );

    const weeklyPoints =
      (normalThisWeekRes.rows[0]?.normal_sessions || 0) * 10 +
      (normalCorrectThisWeekRes.rows[0]?.correct_normal || 0) +
      (editableCorrectThisWeekRes.rows[0]?.correct_editable || 0);

    // -----------------------------
    // 7) Quizzes in Week Achievement (>=5)
    //    Count both normal sessions this week + distinct editable session_ids this week
    // -----------------------------
    const editableSessionsThisWeekRes = await pool.query(
      `SELECT COUNT(DISTINCT session_id)::int AS editable_sessions_week
       FROM editing_quiz_answers
       WHERE user_id = $1
         AND created_at >= date_trunc('week', CURRENT_DATE)`,
      [userId]
    );

    const quizzesInWeekCount =
      (normalThisWeekRes.rows[0]?.normal_sessions || 0) +
      (editableSessionsThisWeekRes.rows[0]?.editable_sessions_week || 0);

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
        },
      },
    });
  } catch (err) {
    console.error("Error in getProgressPageDatawithMonthly:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};
