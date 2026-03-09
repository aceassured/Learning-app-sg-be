import pool from "../../database.js";
import { io } from "../../index.js";
import { NotificationService } from "../services/notificationService.js";
import { sendNotification } from "../utils/sendNotification.js";

// helper: get today's quiz status

export const getHomeData = async (req, res) => {
  const userId = req.userId;

  try {

    // ✅ Fetch today’s session (only daily type + finished)
    const todayRes = await pool.query(
      `SELECT s.*, COUNT(a.*) AS answered_count
       FROM user_quiz_sessions s
       LEFT JOIN user_answers a ON a.session_id = s.id
       WHERE s.user_id = $1
         AND s.started_at::date = current_date
         AND s.type = 'daily'
         AND s.finished_at IS NOT NULL
       GROUP BY s.id
       ORDER BY s.started_at DESC
       LIMIT 1`,
      [userId]
    );

    const todaySession = todayRes.rows[0] || null;


    // ✅ FIX: ensure today's activity exists for streak calculation
    if (todaySession) {

      const correct = todaySession.score || 0;

      const incorrect =
        (todaySession.answered_count || 0) - correct;

      await pool.query(
        `INSERT INTO user_activity
         (user_id, activity_date, correct_count, incorrect_count)
         VALUES ($1, CURRENT_DATE, $2, $3)
         ON CONFLICT (user_id, activity_date)
         DO UPDATE SET
           correct_count = EXCLUDED.correct_count,
           incorrect_count = EXCLUDED.incorrect_count`,
        [userId, correct, incorrect]
      );
    }


    // ✅ Weekly activity data
    const weekDatesRes = await pool.query(
      `SELECT activity_date, correct_count, incorrect_count 
       FROM user_activity
       WHERE user_id = $1 
         AND activity_date >= date_trunc('week', current_date)
       ORDER BY activity_date`,
      [userId]
    );

    const weekMap = {};

    weekDatesRes.rows.forEach(r => {
      weekMap[r.activity_date.toISOString().slice(0, 10)] = r;
    });


    // ✅ Calculate consecutive days of activity
    let consecutive = 0;

    for (let i = 6; i >= 0; i--) {

      const date = new Date();
      date.setDate(date.getDate() - i);

      const dayKey = date.toISOString().slice(0, 10);

      const entry = weekMap[dayKey];

      if (entry && (entry.correct_count + entry.incorrect_count) > 0) {
        consecutive++;
      } else {
        consecutive = 0;
      }

    }


    const all7 =
      Object.keys(weekMap).length === 7 &&
      Object.values(weekMap).every(
        e => e.correct_count + e.incorrect_count > 0
      );


    // ✅ Monthly stats
    const monthRes = await pool.query(
      `SELECT SUM(correct_count) as correct, SUM(incorrect_count) as incorrect
       FROM user_activity 
       WHERE user_id = $1 
         AND date_trunc('month', activity_date) = date_trunc('month', current_date)`,
      [userId]
    );

    const month =
      monthRes.rows[0] || { correct: 0, incorrect: 0 };

    const completedThisMonth =
      +(month.correct || 0) + +(month.incorrect || 0);


    // ✅ Full streak count
    const streakRes = await pool.query(
      `SELECT DISTINCT activity_date
       FROM user_activity
       WHERE user_id = $1 
         AND (correct_count + incorrect_count) > 0
       ORDER BY activity_date DESC`,
      [userId]
    );

    let streakCount = 0;

    if (streakRes.rows.length > 0) {

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let currentDate = new Date(today);

      for (let r of streakRes.rows) {

        const activityDate = new Date(r.activity_date);
        activityDate.setHours(0, 0, 0, 0);

        if (activityDate.getTime() === currentDate.getTime()) {

          streakCount++;
          currentDate.setDate(currentDate.getDate() - 1);

        } else if (
          activityDate.getTime() ===
          currentDate.getTime() - 24 * 60 * 60 * 1000
        ) {

          streakCount++;
          currentDate.setDate(currentDate.getDate() - 1);

        } else {

          break; // gap → streak ends

        }
      }
    }


    res.json({
      ok: true,
      todaySession,
      week: weekDatesRes.rows,
      all7: all7 ? 7 : 0,
      consecutive,
      monthly: {
        completed: completedThisMonth,
        target: 25
      },
      streakCount
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      ok: false,
      message: 'Server error'
    });

  }
};


// start quiz...........

// export const startQuiz = async (req, res) => {
//   try {
//     const userId = req.userId;
//     const { subjects, topics } = req.body;

//     // ✅ 1️⃣ Get user's daily question limit
//     const userRes = await pool.query(
//       "SELECT questions_per_day FROM users WHERE id=$1",
//       [userId]
//     );
//     const qpd = userRes.rows[0]?.questions_per_day || 10;

//     // ✅ 2️⃣ Get already answered normal question_ids
//     const answeredRes = await pool.query(
//       "SELECT question_id FROM user_answered_questions WHERE user_id=$1",
//       [userId]
//     );
//     const answeredIds = answeredRes.rows.map((r) => r.question_id);

//     // ==========================================================
//     // 🎯 3️⃣ Fetch Normal Questions
//     // ==========================================================
//     let normalQuery = `
//       SELECT 
//         id,
//         subject,
//         topic_id,
//         question_text,
//         options,
//         question_url,
//         answer_file_url,
//         answer_explanation
//       FROM questions
//       WHERE NOT (id = ANY($1::int[]))
//     `;
//     const queryParams = [answeredIds];

//     if (topics?.length) {
//       normalQuery += ` AND topic_id = ANY($2::int[])`;
//       queryParams.push(topics);
//     } else if (subjects?.length) {
//       const subjectNamesRes = await pool.query(
//         "SELECT subject FROM subjects WHERE id = ANY($1)",
//         [subjects]
//       );
//       const subjectNames = subjectNamesRes.rows.map((r) =>
//         r.subject.toLowerCase()
//       );
//       normalQuery += ` AND LOWER(subject) = ANY($${queryParams.length + 1})`;
//       queryParams.push(subjectNames);
//     }

//     normalQuery += ` ORDER BY random() LIMIT $${queryParams.length + 1}`;
//     queryParams.push(Math.ceil(qpd / 2)); // half from normal

//     const normalRes = await pool.query(normalQuery, queryParams);

//     // ==========================================================
//     // 🎯 4️⃣ Fetch Editable Quizzes
//     // ==========================================================

//     const desiredEditableCount = Math.floor(qpd / 2);

//     let editableQuery = `
//   WITH answered AS (
//     SELECT question_id
//     FROM editing_quiz_answers
//     WHERE user_id = $1
//     GROUP BY question_id
//   )
//   SELECT 
//     eq.id AS quiz_id,
//     eq.title,
//     eq.passage,
//     eq.grade_id,
//     eq.subject_id,
//     eq.topic_id,
//     json_agg(
//       json_build_object(
//         'id', eqq.id,
//         'incorrect_word', eqq.incorrect_word,
//         'correct_word', eqq.correct_word,
//         'position', eqq.position
//       )
//       ORDER BY eqq.position
//     ) AS questions
//   FROM editing_quiz eq
//   JOIN editing_quiz_questions eqq ON eqq.quiz_id = eq.id
//   LEFT JOIN answered a ON a.question_id = eqq.id
//   WHERE a.question_id IS NULL
// `;

//     let editableParams = [userId];
//     let paramIndex = 2;

//     // 🟦 Filter by TOPICS
//     if (topics?.length) {
//       editableQuery += ` AND eq.topic_id = ANY($${paramIndex}::int[])`;
//       editableParams.push(topics);
//       paramIndex++;
//     }

//     // 🟩 Filter by SUBJECTS
//     else if (subjects?.length) {
//       editableQuery += ` AND eq.subject_id = ANY($${paramIndex}::int[])`;
//       editableParams.push(subjects);
//       paramIndex++;
//     }

//     editableQuery += `
//   GROUP BY eq.id
//   HAVING COUNT(eqq.id) > 0
//   ORDER BY random()
//   LIMIT $${paramIndex}
// `;
//     editableParams.push(desiredEditableCount);
//     const editableQuizRes = await pool.query(editableQuery, editableParams);

//     // ==========================================================
//     // 🎯 5️⃣ Combine & Format Data
//     // ==========================================================
//     const normalQuestions = normalRes.rows.map((q) => ({
//       id: q.id,
//       subject: q.subject,
//       topic_id: q.topic_id,
//       question_text: q.question_text,
//       options: q.options,
//       question_url: q.question_url,
//       answer_file_url: q.answer_file_url,
//       answer_explanation: q.answer_explanation,
//       type: "normal",
//     }));

//     const editableQuizzes = editableQuizRes.rows.map((quiz) => ({
//       id: quiz.quiz_id,
//       title: quiz.title,
//       passage: quiz.passage,
//       grade_id: quiz.grade_id,
//       subject_id: quiz.subject_id,
//       topic_id: quiz.topic_id,
//       questions: quiz.questions,
//       type: "editable",
//     }));

//     // ✅ Merge and Shuffle both types
//     const combinedQuestions = [...editableQuizzes, ...normalQuestions].sort(
//       () => Math.random() - 0.5
//     );

//     // ==========================================================
//     // 🎯 6️⃣ Insert Quiz Session
//     // ==========================================================
//     const sessionRes = await pool.query(
//       `
//       INSERT INTO user_quiz_sessions 
//       (user_id, started_at, allowed_duration_seconds, total_questions, type)
//       VALUES ($1, now(), 300, $2, 'mixed')
//       RETURNING *
//       `,
//       [userId, combinedQuestions.length]
//     );

//     const session = sessionRes.rows[0];

//     // ==========================================================
//     // ✅ 7️⃣ Final Response (Frontend-Compatible)
//     // ==========================================================
//     return res.status(200).json({
//       ok: true,
//       session,
//       questions: combinedQuestions,
//     });
//   } catch (err) {
//     console.error("startQuiz error:", err);
//     return res.status(500).json({ ok: false, message: "Server error" });
//   }
// };


export const startQuiz = async (req, res) => {
  try {

    const userId = req.userId;
    const { subjects } = req.body;

    // =====================================================
    // 1️⃣ Get quiz size
    // =====================================================
    const userRes = await pool.query(
      `SELECT questions_per_day FROM users WHERE id = $1`,
      [userId]
    );

    const TOTAL = userRes.rows[0]?.questions_per_day || 10;

    // =====================================================
    // 2️⃣ Already answered
    // =====================================================
    const answeredRes = await pool.query(
      `
      SELECT DISTINCT a.question_id
      FROM user_answers a
      JOIN user_quiz_sessions s ON a.session_id = s.id
      WHERE s.user_id = $1
      `,
      [userId]
    );

    const answeredIds = answeredRes.rows.map(r => r.question_id);

    // =====================================================
    // 3️⃣ Distribution
    // =====================================================
    const NORMAL_COUNT = 3;
    const EDITABLE_COUNT = 3;
    const COMPREHENSION_COUNT = 2;
    const CLOZE_COUNT = 2;

    let selectedQuestions = [];

    // =====================================================
    // 4️⃣ NORMAL
    // =====================================================
    const normalRes = await pool.query(
      `
      SELECT *
      FROM questions
      WHERE question_type = 'normal'
      AND NOT (id = ANY($1::int[]))
      ${subjects?.length ? `AND subject_id = ANY($2::int[])` : ``}
      ORDER BY random()
      LIMIT ${NORMAL_COUNT}
      `,
      subjects?.length ? [answeredIds, subjects] : [answeredIds]
    );

    selectedQuestions.push(...normalRes.rows);

    // =====================================================
    // 5️⃣ EDITABLE
    // =====================================================
    const editableRes = await pool.query(
      `
      SELECT *
      FROM questions
      WHERE question_type = 'editable'
      AND NOT (id = ANY($1::int[]))
      ${subjects?.length ? `AND subject_id = ANY($2::int[])` : ``}
      ORDER BY random()
      LIMIT ${EDITABLE_COUNT}
      `,
      subjects?.length ? [answeredIds, subjects] : [answeredIds]
    );

    selectedQuestions.push(...editableRes.rows);

    // =====================================================
    // 6️⃣ COMPREHENSION GRAMMAR
    // =====================================================
    const compRes = await pool.query(
      `
      SELECT *
      FROM questions
      WHERE question_type = 'grammar_cloze'
      AND NOT (id = ANY($1::int[]))
      ${subjects?.length ? `AND subject_id = ANY($2::int[])` : ``}
      ORDER BY random()
      LIMIT ${COMPREHENSION_COUNT}
      `,
      subjects?.length ? [answeredIds, subjects] : [answeredIds]
    );

    selectedQuestions.push(...compRes.rows);

    // =====================================================
    // 7️⃣ CLOZE
    // =====================================================
    const clozeRes = await pool.query(
      `
      SELECT *
      FROM questions
      WHERE question_type = 'comprehension_cloze'
      AND NOT (id = ANY($1::int[]))
      ${subjects?.length ? `AND subject_id = ANY($2::int[])` : ``}
      ORDER BY random()
      LIMIT ${CLOZE_COUNT}
      `,
      subjects?.length ? [answeredIds, subjects] : [answeredIds]
    );

    selectedQuestions.push(...clozeRes.rows);

    // =====================================================
    // 8️⃣ Fill remaining if missing
    // =====================================================
    const remaining = TOTAL - selectedQuestions.length;

    if (remaining > 0) {

      const existingIds = selectedQuestions.map(q => q.id);

      let query = `
        SELECT *
        FROM questions
        WHERE NOT (id = ANY($1::int[]))
        AND NOT (id = ANY($2::int[]))
      `;

      const params = [answeredIds, existingIds];

      if (subjects?.length) {
        params.push(subjects);
        query += ` AND subject_id = ANY($${params.length}::int[])`;
      }

      params.push(remaining);
      query += ` ORDER BY random() LIMIT $${params.length}`;

      const extraRes = await pool.query(query, params);

      selectedQuestions.push(...extraRes.rows);
    }

    // =====================================================
    // 9️⃣ Format
    // =====================================================
    const formatted = selectedQuestions.map(q => {

      // EDITABLE
      if (q.question_type === "editable") {
        return {
          id: q.id,
          title: q.extra_data?.title || "Untitled Quiz",
          passage: q.question_text,
          blanks: q.extra_data?.blanks || [],
          instructions: q.extra_data?.instructions || "",
          type: "editable"
        };
      }

      // COMPREHENSION GRAMMER
      if (q.question_type === "grammar_cloze") {
        return {
          id: q.id,
          title: q.extra_data?.title || "Untitled",
          passage: q.question_text,
          options: q.extra_data?.options || [],
          correctAnswers: q.extra_data?.correctAnswers || {},
          type: "grammar_cloze"
        };
      }

      // CLOZE
      if (q.question_type === "comprehension_cloze") {
        return {
          id: q.id,
          title: q.extra_data?.title || "Untitled",
          passage: q.question_text,
          correctAnswers: q.extra_data?.correctAnswers || {},
          type: "comprehension_cloze"
        };
      }

      // NORMAL
      return {
        id: q.id,
        question_text: q.question_text,
        options: q.options,
        question_url: q.question_url,
        answer_file_url: q.answer_file_url,
        answer_explanation: q.answer_explanation,
        type: "normal"
      };

    });

    // =====================================================
    // 🔟 Shuffle
    // =====================================================
    const shuffled = formatted.sort(() => Math.random() - 0.5);

    // =====================================================
    // 1️⃣1️⃣ Create session
    // =====================================================
    const sessionRes = await pool.query(
      `
      INSERT INTO user_quiz_sessions
      (user_id, started_at, allowed_duration_seconds, total_questions, type)
      VALUES ($1, NOW(), 300, $2, 'mixed')
      RETURNING *
      `,
      [userId, shuffled.length]
    );

    return res.json({
      ok: true,
      session: sessionRes.rows[0],
      questions: shuffled
    });

  } catch (err) {

    console.error("startQuiz error:", err);

    return res.status(500).json({
      ok: false,
      message: "Server error"
    });

  }
};


export const startDailyQuiz = async (req, res) => {
  try {

    const userId = req.userId;

    // ============================================
    // 1️⃣ Get user data
    // ============================================
    const userRes = await pool.query(
      `SELECT questions_per_day, selected_subjects, grade_id
       FROM users
       WHERE id = $1`,
      [userId]
    );

    const user = userRes.rows[0];

    if (!user) {
      return res.status(404).json({
        ok: false,
        message: "User not found"
      });
    }

    const qpd = user.questions_per_day || 10;
    const subjects = user.selected_subjects || [];
    const gradeId = user.grade_id;

    // ============================================
    // 2️⃣ Get all question types
    // ============================================

    const typeRes = await pool.query(`
      SELECT DISTINCT question_type
      FROM questions
    `);

    const types = typeRes.rows.map(t => t.question_type);

    let collectedQuestions = [];

    // ============================================
    // 3️⃣ Get 1 question from each type
    // ============================================

    for (const type of types) {

      const qRes = await pool.query(
        `
        SELECT *
        FROM questions
        WHERE question_type = $1
        AND grade_id = $2
        AND subject_id = ANY($3::int[])
        ORDER BY random()
        LIMIT 1
        `,
        [type, gradeId, subjects]
      );

      if (qRes.rows.length) {
        collectedQuestions.push(qRes.rows[0]);
      }
    }

    // ============================================
    // 4️⃣ Fill remaining randomly
    // ============================================

    const remaining = qpd - collectedQuestions.length;

    if (remaining > 0) {

      const extraRes = await pool.query(
        `
        SELECT *
        FROM questions
        WHERE grade_id = $1
        AND subject_id = ANY($2::int[])
        ORDER BY random()
        LIMIT $3
        `,
        [gradeId, subjects, remaining]
      );

      collectedQuestions = [
        ...collectedQuestions,
        ...extraRes.rows
      ];
    }

    // ============================================
    // 5️⃣ Format questions
    // ============================================

    const formattedQuestions = collectedQuestions.map(q => {

      // EDITABLE
      if (q.question_type === "editable") {
        return {
          id: q.id,
          title: q.extra_data?.title || "Untitled Quiz",
          passage: q.question_text,
          grade_id: q.grade_id,
          subject_id: q.subject_id,
          topic_id: q.topic_id,
          blanks: q.extra_data?.blanks || [],
          type: "editable"
        };
      }

      // COMPREHENSION GRAMMER
      if (q.question_type === "grammar_cloze") {
        return {
          id: q.id,
          subject_id: q.subject_id,
          topic_id: q.topic_id,
          title: q.extra_data?.title || "Untitled",
          passage: q.question_text,
          options: q.extra_data?.options || [],
          correctAnswers: q.extra_data?.correctAnswers || {},
          type: "grammar_cloze"
        };
      }

      // NEW CLOZE TYPE
      if (q.question_type === "comprehension_cloze") {
        return {
          id: q.id,
          subject_id: q.subject_id,
          topic_id: q.topic_id,
          title: q.extra_data?.title || "Untitled",
          passage: q.question_text,
          correctAnswers: q.extra_data?.correctAnswers || {},
          type: "comprehension_cloze"
        };
      }

      // NORMAL
      return {
        id: q.id,
        subject_id: q.subject_id,
        topic_id: q.topic_id,
        question_text: q.question_text,
        options: q.options,
        question_url: q.question_url,
        answer_file_url: q.answer_file_url,
        answer_explanation: q.answer_explanation,
        type: "normal"
      };

    });

    // ============================================
    // 6️⃣ Shuffle
    // ============================================

    const shuffledQuestions =
      formattedQuestions.sort(() => Math.random() - 0.5);

    // ============================================
    // 7️⃣ Create session
    // ============================================

    const sessionRes = await pool.query(
      `
      INSERT INTO user_quiz_sessions
      (user_id, started_at, allowed_duration_seconds, total_questions, type)
      VALUES ($1, NOW(), 300, $2, 'daily')
      RETURNING *
      `,
      [userId, shuffledQuestions.length]
    );

    const session = sessionRes.rows[0];

    // ============================================
    // 8️⃣ Response
    // ============================================

    return res.status(200).json({
      ok: true,
      session,
      questions: shuffledQuestions
    });

  } catch (err) {

    console.error("startDailyQuiz error:", err);

    return res.status(500).json({
      ok: false,
      message: "Server error"
    });

  }
};

// start big quiz....

// export const startbigQuiz = async (req, res) => {
//   try {
//     const userId = req.userId;
//     const { subjects, topics } = req.body;

//     // ✅ 1️⃣ Get user's daily question limit
//     const userRes = await pool.query(
//       "SELECT questions_per_day FROM users WHERE id=$1",
//       [userId]
//     );
//     const qpd = 30;

//     // ✅ 2️⃣ Get already answered normal question_ids
//     const answeredRes = await pool.query(
//       "SELECT question_id FROM user_answered_questions WHERE user_id=$1",
//       [userId]
//     );
//     const answeredIds = answeredRes.rows.map((r) => r.question_id);

//     // ==========================================================
//     // 🎯 3️⃣ Fetch Normal Questions
//     // ==========================================================
//     let normalQuery = `
//       SELECT 
//         id,
//         subject,
//         topic_id,
//         question_text,
//         options,
//         question_url,
//         answer_file_url,
//         answer_explanation
//       FROM questions
//       WHERE NOT (id = ANY($1::int[]))
//     `;
//     const queryParams = [answeredIds];

//     if (topics?.length) {
//       normalQuery += ` AND topic_id = ANY($2::int[])`;
//       queryParams.push(topics);
//     } else if (subjects?.length) {
//       const subjectNamesRes = await pool.query(
//         "SELECT subject FROM subjects WHERE id = ANY($1)",
//         [subjects]
//       );
//       const subjectNames = subjectNamesRes.rows.map((r) =>
//         r.subject.toLowerCase()
//       );
//       normalQuery += ` AND LOWER(subject) = ANY($${queryParams.length + 1})`;
//       queryParams.push(subjectNames);
//     }

//     normalQuery += ` ORDER BY random() LIMIT $${queryParams.length + 1}`;
//     queryParams.push(Math.ceil(qpd / 2)); // half from normal

//     const normalRes = await pool.query(normalQuery, queryParams);

//     // ==========================================================
//     // 🎯 4️⃣ Fetch Editable Quizzes
//     // ==========================================================

//     const desiredEditableCount = Math.floor(qpd / 2);

//     let editableQuery = `
//   WITH answered AS (
//     SELECT question_id
//     FROM editing_quiz_answers
//     WHERE user_id = $1
//     GROUP BY question_id
//   )
//   SELECT 
//     eq.id AS quiz_id,
//     eq.title,
//     eq.passage,
//     eq.grade_id,
//     eq.subject_id,
//     eq.topic_id,
//     json_agg(
//       json_build_object(
//         'id', eqq.id,
//         'incorrect_word', eqq.incorrect_word,
//         'correct_word', eqq.correct_word,
//         'position', eqq.position
//       )
//       ORDER BY eqq.position
//     ) AS questions
//   FROM editing_quiz eq
//   JOIN editing_quiz_questions eqq ON eqq.quiz_id = eq.id
//   LEFT JOIN answered a ON a.question_id = eqq.id
//   WHERE a.question_id IS NULL
// `;

//     let editableParams = [userId];
//     let paramIndex = 2;

//     // 🟦 Filter by TOPICS
//     if (topics?.length) {
//       editableQuery += ` AND eq.topic_id = ANY($${paramIndex}::int[])`;
//       editableParams.push(topics);
//       paramIndex++;
//     }

//     // 🟩 Filter by SUBJECTS
//     else if (subjects?.length) {
//       editableQuery += ` AND eq.subject_id = ANY($${paramIndex}::int[])`;
//       editableParams.push(subjects);
//       paramIndex++;
//     }

//     editableQuery += `
//   GROUP BY eq.id
//   HAVING COUNT(eqq.id) > 0
//   ORDER BY random()
//   LIMIT $${paramIndex}
// `;
//     editableParams.push(desiredEditableCount);
//     const editableQuizRes = await pool.query(editableQuery, editableParams);

//     // ==========================================================
//     // 🎯 5️⃣ Combine & Format Data
//     // ==========================================================
//     const normalQuestions = normalRes.rows.map((q) => ({
//       id: q.id,
//       subject: q.subject,
//       topic_id: q.topic_id,
//       question_text: q.question_text,
//       options: q.options,
//       question_url: q.question_url,
//       answer_file_url: q.answer_file_url,
//       answer_explanation: q.answer_explanation,
//       type: "normal",
//     }));

//     const editableQuizzes = editableQuizRes.rows.map((quiz) => ({
//       id: quiz.quiz_id,
//       title: quiz.title,
//       passage: quiz.passage,
//       grade_id: quiz.grade_id,
//       subject_id: quiz.subject_id,
//       topic_id: quiz.topic_id,
//       questions: quiz.questions,
//       type: "editable",
//     }));

//     // ✅ Merge and Shuffle both types
//     const combinedQuestions = [...editableQuizzes, ...normalQuestions].sort(
//       () => Math.random() - 0.5
//     );

//     // ==========================================================
//     // 🎯 6️⃣ Insert Quiz Session
//     // ==========================================================
//     const sessionRes = await pool.query(
//       `
//       INSERT INTO user_quiz_sessions 
//       (user_id, started_at, allowed_duration_seconds, total_questions, type)
//       VALUES ($1, now(), 300, $2, 'mixed')
//       RETURNING *
//       `,
//       [userId, combinedQuestions.length]
//     );

//     const session = sessionRes.rows[0];

//     // ==========================================================
//     // ✅ 7️⃣ Final Response (Frontend-Compatible)
//     // ==========================================================
//     return res.status(200).json({
//       ok: true,
//       session,
//       questions: combinedQuestions,
//     });
//   } catch (err) {
//     console.error("startQuiz error:", err);
//     return res.status(500).json({ ok: false, message: "Server error" });
//   }
// };


export const startbigQuiz = async (req, res) => {
  try {

    const userId = req.userId;
    const { subjects } = req.body;

    const TOTAL = 30;

    // =====================================================
    // 1️⃣ Already answered questions
    // =====================================================
    const answeredRes = await pool.query(
      `
      SELECT DISTINCT a.question_id
      FROM user_answers a
      JOIN user_quiz_sessions s ON a.session_id = s.id
      WHERE s.user_id = $1
      `,
      [userId]
    );

    const answeredIds = answeredRes.rows.map(r => r.question_id);

    // =====================================================
    // 2️⃣ Distribution
    // =====================================================
    const NORMAL_COUNT = 10;
    const EDITABLE_COUNT = 8;
    const COMPREHENSION_COUNT = 6;
    const CLOZE_COUNT = 6;

    let selectedQuestions = [];

    // =====================================================
    // 3️⃣ NORMAL
    // =====================================================
    const normalRes = await pool.query(
      `
      SELECT *
      FROM questions
      WHERE question_type = 'normal'
      AND NOT (id = ANY($1::int[]))
      ${subjects?.length ? `AND subject_id = ANY($2::int[])` : ``}
      ORDER BY random()
      LIMIT ${NORMAL_COUNT}
      `,
      subjects?.length ? [answeredIds, subjects] : [answeredIds]
    );

    selectedQuestions.push(...normalRes.rows);

    // =====================================================
    // 4️⃣ EDITABLE
    // =====================================================
    const editableRes = await pool.query(
      `
      SELECT *
      FROM questions
      WHERE question_type = 'editable'
      AND NOT (id = ANY($1::int[]))
      ${subjects?.length ? `AND subject_id = ANY($2::int[])` : ``}
      ORDER BY random()
      LIMIT ${EDITABLE_COUNT}
      `,
      subjects?.length ? [answeredIds, subjects] : [answeredIds]
    );

    selectedQuestions.push(...editableRes.rows);

    // =====================================================
    // 5️⃣ COMPREHENSION GRAMMER
    // =====================================================
    const compRes = await pool.query(
      `
      SELECT *
      FROM questions
      WHERE question_type = 'grammar_cloze'
      AND NOT (id = ANY($1::int[]))
      ${subjects?.length ? `AND subject_id = ANY($2::int[])` : ``}
      ORDER BY random()
      LIMIT ${COMPREHENSION_COUNT}
      `,
      subjects?.length ? [answeredIds, subjects] : [answeredIds]
    );

    selectedQuestions.push(...compRes.rows);

    // =====================================================
    // 6️⃣ CLOZE
    // =====================================================
    const clozeRes = await pool.query(
      `
      SELECT *
      FROM questions
      WHERE question_type = 'comprehension_cloze'
      AND NOT (id = ANY($1::int[]))
      ${subjects?.length ? `AND subject_id = ANY($2::int[])` : ``}
      ORDER BY random()
      LIMIT ${CLOZE_COUNT}
      `,
      subjects?.length ? [answeredIds, subjects] : [answeredIds]
    );

    selectedQuestions.push(...clozeRes.rows);

    // =====================================================
    // 7️⃣ Fill remaining if needed
    // =====================================================
    const remaining = TOTAL - selectedQuestions.length;

    if (remaining > 0) {

      const existingIds = selectedQuestions.map(q => q.id);

      let query = `
        SELECT *
        FROM questions
        WHERE NOT (id = ANY($1::int[]))
        AND NOT (id = ANY($2::int[]))
      `;

      const params = [answeredIds, existingIds];

      if (subjects?.length) {
        params.push(subjects);
        query += ` AND subject_id = ANY($${params.length}::int[])`;
      }

      params.push(remaining);
      query += ` ORDER BY random() LIMIT $${params.length}`;

      const extraRes = await pool.query(query, params);

      selectedQuestions.push(...extraRes.rows);
    }

    // =====================================================
    // 8️⃣ Format Questions
    // =====================================================
    const formatted = selectedQuestions.map(q => {

      // EDITABLE
      if (q.question_type === "editable") {
        return {
          id: q.id,
          title: q.extra_data?.title || "Untitled Quiz",
          passage: q.question_text,
          grade_id: q.grade_id,
          subject_id: q.subject_id,
          topic_id: q.topic_id,
          blanks: q.extra_data?.blanks || [],
          instructions: q.extra_data?.instructions || "",
          type: "editable"
        };
      }

      // COMPREHENSION GRAMMER
      if (q.question_type === "grammar_cloze") {
        return {
          id: q.id,
          subject_id: q.subject_id,
          topic_id: q.topic_id,
          title: q.extra_data?.title || "Untitled",
          passage: q.question_text,
          options: q.extra_data?.options || [],
          correctAnswers: q.extra_data?.correctAnswers || {},
          type: "grammar_cloze"
        };
      }

      // CLOZE
      if (q.question_type === "comprehension_cloze") {
        return {
          id: q.id,
          subject_id: q.subject_id,
          topic_id: q.topic_id,
          title: q.extra_data?.title || "Untitled",
          passage: q.question_text,
          correctAnswers: q.extra_data?.correctAnswers || {},
          type: "comprehension_cloze"
        };
      }

      // NORMAL
      return {
        id: q.id,
        subject_id: q.subject_id,
        topic_id: q.topic_id,
        question_text: q.question_text,
        options: q.options,
        question_url: q.question_url,
        answer_file_url: q.answer_file_url,
        answer_explanation: q.answer_explanation,
        type: "normal"
      };

    });

    // =====================================================
    // 9️⃣ Shuffle
    // =====================================================
    const shuffled = formatted.sort(() => Math.random() - 0.5);

    // =====================================================
    // 🔟 Create Session
    // =====================================================
    const sessionRes = await pool.query(
      `
      INSERT INTO user_quiz_sessions
      (user_id, started_at, allowed_duration_seconds, total_questions, type)
      VALUES ($1, NOW(), 600, $2, 'big')
      RETURNING *
      `,
      [userId, shuffled.length]
    );

    return res.status(200).json({
      ok: true,
      session: sessionRes.rows[0],
      questions: shuffled
    });

  } catch (err) {

    console.error("startBigQuiz error:", err);

    return res.status(500).json({
      ok: false,
      message: "Server error"
    });

  }
};


// submit answers for a session.......

export const submitAnswers = async (req, res) => {
  const client = await pool.connect();

  try {

    const userId = req.userId;

    const { session_id, answers, time_per_question } = req.body;

    if (!session_id || !Array.isArray(answers)) {
      return res.status(400).json({
        ok: false,
        message: "Invalid payload"
      });
    }

    await client.query("BEGIN");

    // =============================
    // 1️⃣ Validate Session
    // =============================
    const sessionRes = await client.query(
      `SELECT *
       FROM user_quiz_sessions
       WHERE id = $1
       AND user_id = $2`,
      [session_id, userId]
    );

    if (!sessionRes.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        ok: false,
        message: "Session not found"
      });
    }

    const session = sessionRes.rows[0];

    if (session.finished_at) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        ok: false,
        message: "Quiz already submitted"
      });
    }

    // =============================
    // 2️⃣ Fetch Questions
    // =============================
    const questionIds = answers.map(a => a.question_id);

    const questionRes = await client.query(
      `SELECT *
       FROM questions
       WHERE id = ANY($1::int[])`,
      [questionIds]
    );

    const questionMap = {};

    questionRes.rows.forEach(q => {
      questionMap[q.id] = q;
    });

    let totalScore = 0;
    let totalPossible = 0;

    // =============================
    // 3️⃣ TYPE HANDLERS
    // =============================
    const handlers = {

      normal: (question, userAnswer) => {

        const isCorrect =
          Number(question.correct_option_id) === Number(userAnswer);

        return {
          score: isCorrect ? 1 : 0,
          total: 1,
          isCorrect
        };
      },

      editable: (question, userAnswer) => {

        const extra =
          typeof question.extra_data === "string"
            ? JSON.parse(question.extra_data)
            : question.extra_data;

        const blanks = extra?.blanks || [];

        let score = 0;

        for (const blank of blanks) {

          const correct = blank.correct_word
            ?.toString()
            .toLowerCase()
            .trim();

          const user = userAnswer?.[String(blank.position)]
            ?.toString()
            .toLowerCase()
            .trim();

          if (correct && user && correct === user) {
            score++;
          }
        }

        return {
          score,
          total: blanks.length,
          isCorrect: score === blanks.length
        };
      },

      grammar_cloze: (question, userAnswer) => {

        const extra =
          typeof question.extra_data === "string"
            ? JSON.parse(question.extra_data)
            : question.extra_data;

        const correctAnswers = extra?.correctAnswers || {};

        let score = 0;

        for (const key in correctAnswers) {

          const user = userAnswer?.[String(key)];

          if (correctAnswers[key] === user) {
            score++;
          }
        }

        return {
          score,
          total: Object.keys(correctAnswers).length,
          isCorrect:
            score === Object.keys(correctAnswers).length
        };
      },

      comprehension_cloze: (question, userAnswer) => {

        const extra =
          typeof question.extra_data === "string"
            ? JSON.parse(question.extra_data)
            : question.extra_data;

        const correctAnswers = extra?.correctAnswers || {};

        let score = 0;

        for (const key in correctAnswers) {

          const correct =
            correctAnswers[key]
              ?.toString()
              .toLowerCase()
              .trim();

          const user =
            userAnswer?.[String(key)]
              ?.toString()
              .toLowerCase()
              .trim();

          if (correct === user) {
            score++;
          }
        }

        return {
          score,
          total: Object.keys(correctAnswers).length,
          isCorrect:
            score === Object.keys(correctAnswers).length
        };
      }

    };

    // =============================
    // 4️⃣ PROCESS ANSWERS
    // =============================
    for (const ans of answers) {

      const question = questionMap[ans.question_id];

      if (!question) continue;

      const type = question.question_type
        ?.toLowerCase()
        .trim();

      if (!handlers[type]) {
        console.log("Unknown question type:", type);
        continue;
      }

      const userAnswer =
        ans.answer_json ??
        ans.answer ??
        ans.selected_option_id ??
        null;

      const result = handlers[type](question, userAnswer);

      totalScore += result.score;
      totalPossible += result.total;

      let selectedOption = null;
      let answerJson = null;

      if (type === "normal") {
        selectedOption = Number(userAnswer);
      } else {
        answerJson = JSON.stringify(userAnswer);
      }

      await client.query(
        `
        INSERT INTO user_answers
        (session_id, question_id, selected_option_id, answer_json, is_correct, answered_at)
        VALUES ($1,$2,$3,$4,$5,NOW())
        ON CONFLICT (session_id, question_id)
        DO UPDATE SET
          selected_option_id = EXCLUDED.selected_option_id,
          answer_json = EXCLUDED.answer_json,
          is_correct = EXCLUDED.is_correct,
          answered_at = NOW()
        `,
        [
          session_id,
          ans.question_id,
          selectedOption,
          answerJson,
          result.isCorrect
        ]
      );
    }

    // =============================
    // 5️⃣ Update Session
    // =============================
    await client.query(
      `
      UPDATE user_quiz_sessions
      SET finished_at = NOW(),
          score = $1,
          time_per_question = $2
      WHERE id = $3
      `,
      [
        totalScore,
        time_per_question ?? null,
        session_id
      ]
    );

    await client.query("COMMIT");

    return res.json({
      ok: true,
      score: totalScore,
      total: totalPossible,
      percentage: totalPossible
        ? Math.round((totalScore / totalPossible) * 100)
        : 0
    });

  } catch (error) {

    await client.query("ROLLBACK");

    console.error("Submit error:", error);

    return res.status(500).json({
      ok: false,
      message: "Internal server error"
    });

  } finally {

    client.release();

  }
};

// quiz review.......

export const reviewSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.userId;

    const sessionRes = await pool.query(
      `SELECT * FROM user_quiz_sessions
       WHERE id=$1 AND user_id=$2`,
      [sessionId, userId]
    );

    if (!sessionRes.rowCount) {
      return res.status(404).json({
        ok: false,
        message: "Session not found"
      });
    }

    const session = sessionRes.rows[0];

    const answerRes = await pool.query(
      `SELECT 
          ua.question_id,
          ua.answer_json,
          ua.selected_option_id,
          ua.is_correct,
          q.question_type,
          q.question_text,
          q.options,
          q.correct_option_id,
          q.extra_data
       FROM user_answers ua
       JOIN questions q ON q.id = ua.question_id
       WHERE ua.session_id = $1`,
      [sessionId]
    );

    const review = [];
    let totalMarks = 0;
    let obtainedMarks = 0;

    for (const row of answerRes.rows) {

      const type = (row.question_type || "normal")
        .toLowerCase()
        .trim();

      // userAnswer for non-MCQ
      const userAnswer = row.answer_json;

      // ================= NORMAL (MCQ) =================
      if (type === "normal") {

        const selectedOption = row.selected_option_id;

        const isCorrect =
          Number(row.correct_option_id) === Number(selectedOption);

        review.push({
          type: "normal",
          question_id: row.question_id,
          question_text: row.question_text,
          selected_option_id: selectedOption,
          correct_option_id: row.correct_option_id,
          is_correct: isCorrect,
          mark: isCorrect ? 1 : 0
        });

        totalMarks += 1;
        if (isCorrect) obtainedMarks += 1;
      }

      // ================= EDITABLE =================
      if (type === "editable") {

        const blanks = row.extra_data?.blanks || [];

        for (const blank of blanks) {

          const userWord =
            userAnswer?.[String(blank.position)] || "";

          const isCorrect =
            blank.correct_word
              ?.toLowerCase()
              .trim() ===
            userWord
              ?.toLowerCase()
              .trim();

          review.push({
            type: "editable",
            question_id: row.question_id,
            position: blank.position,
            correct_word: blank.correct_word,
            user_answer: userWord,
            is_correct: isCorrect,
            mark: isCorrect ? 1 : 0
          });

          totalMarks += 1;
          if (isCorrect) obtainedMarks += 1;
        }
      }

      // ================= GRAMMAR CLOZE =================
      if (type === "grammar_cloze") {

        const correctAnswers =
          row.extra_data?.correctAnswers || {};

        for (const key in correctAnswers) {

          const isCorrect =
            correctAnswers[key] === userAnswer?.[key];

          review.push({
            type: "grammar_cloze",
            question_id: row.question_id,
            blank: key,
            correct_answer: correctAnswers[key],
            user_answer: userAnswer?.[key],
            is_correct: isCorrect,
            mark: isCorrect ? 1 : 0
          });

          totalMarks += 1;
          if (isCorrect) obtainedMarks += 1;
        }
      }

      // ================= COMPREHENSION CLOZE =================
      if (type === "comprehension_cloze") {

        const correctAnswers =
          row.extra_data?.correctAnswers || {};

        for (const key in correctAnswers) {

          const correct =
            correctAnswers[key]
              ?.toString()
              .toLowerCase()
              .trim();

          const user =
            userAnswer?.[key]
              ?.toString()
              .toLowerCase()
              .trim();

          const isCorrect = correct === user;

          review.push({
            type: "comprehension_cloze",
            question_id: row.question_id,
            blank: key,
            correct_answer: correctAnswers[key],
            user_answer: userAnswer?.[key],
            is_correct: isCorrect,
            mark: isCorrect ? 1 : 0
          });

          totalMarks += 1;
          if (isCorrect) obtainedMarks += 1;
        }
      }
    }

    return res.json({
      ok: true,
      session,
      totalMarks,
      obtainedMarks,
      percentage: totalMarks
        ? Math.round((obtainedMarks / totalMarks) * 100)
        : 0,
      review
    });

  } catch (err) {
    console.error("reviewSession error:", err);

    return res.status(500).json({
      ok: false,
      message: "Server error"
    });
  }
};

// get topics...

export const getTopics = async (req, res) => {
  try {
    const { subject_id, grade_id, search } = req.body;

    // Validate input
    if (!grade_id || !subject_id) {
      return res.status(400).json({ message: "Both grade_id and subject_id are required" });
    }

    const gradeIdInt = parseInt(grade_id, 10);
    const subjectIdInt = parseInt(subject_id, 10);

    // Build query
    let query = `
      SELECT 
        t.id, 
        t.topic, 
        t.subject_id, 
        t.grade_id,
        s.subject,
        g.grade_level
      FROM topics t
      JOIN subjects s ON t.subject_id = s.id
      JOIN grades g ON t.grade_id = g.id
      WHERE t.grade_id = $1
        AND t.subject_id = $2
    `;

    const values = [gradeIdInt, subjectIdInt];

    if (search) {
      query += ` AND t.topic ILIKE $3`;
      values.push(`%${search}%`);
    }

    query += ` ORDER BY s.subject, t.topic;`;

    const { rows } = await pool.query(query, values);

    return res.status(200).json({
      success: true,
      grade_id: gradeIdInt,
      subject_id: subjectIdInt,
      search: search || null,
      data: rows,
    });

  } catch (error) {
    console.error("Error fetching topics:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// admin get topics...

export const admingetTopics = async (req, res) => {
  try {
    let { grade_id, subject_id } = req.body;

    // ✅ Validate grade_id
    grade_id = parseInt(grade_id, 10);
    if (!grade_id) {
      return res
        .status(400)
        .json({ message: "grade_id is required and must be a valid number" });
    }

    // ✅ Validate subject_id array
    if (!Array.isArray(subject_id) || subject_id.length === 0) {
      return res
        .status(400)
        .json({ message: "subject_id must be a non-empty array" });
    }

    subject_id = subject_id.map((id) => parseInt(id, 10)).filter(Boolean);

    const query = `
      SELECT 
        t.id, 
        t.topic, 
        t.subject_id, 
        t.grade_id,
        s.subject,
        g.grade_level AS grade_level
      FROM topics t
      JOIN subjects s ON t.subject_id = s.id
      JOIN grades g ON t.grade_id = g.id
      WHERE t.grade_id = $1
        AND t.subject_id = ANY($2::int[])
      ORDER BY s.subject, t.topic;
    `;

    const { rows } = await pool.query(query, [grade_id, subject_id]);

    return res.status(200).json({
      success: true,
      data: rows, // flat array of topics with subject + grade
    });

  } catch (error) {
    console.error("Error fetching topics:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};


// start mini quiz.........

// export const startMiniQuiz = async (req, res) => {
//   try {
//     const userId = req.userId;
//     const { subjects, topics } = req.body; // subjects = [id], topics = [id]

//     // ===== 1) Already-answered normal question_ids
//     const answeredRes = await pool.query(
//       `SELECT question_id FROM user_answered_questions WHERE user_id = $1`,
//       [userId]
//     );
//     const answeredIds = answeredRes.rows.map(r => r.question_id);

//     // Helpers
//     const MINI_TOTAL = 5;
//     const desiredEditable = 2; // default target split
//     const desiredNormal = MINI_TOTAL - desiredEditable;

//     // ===== 2) Fetch EDITABLE passages (unanswered targets only)
//     // Build dynamic SQL for editable with filters and (optionally) exclusions
//     const getEditable = async ({ limit, excludeQuizIds = [] }) => {
//       const editableParams = [userId]; // $1
//       let idx = editableParams.length;

//       let where = `a.question_id IS NULL`; // only unanswered targets

//       if (topics?.length) {
//         editableParams.push(topics); // $2
//         idx++;
//         where += ` AND eq.topic_id = ANY($${idx})`;
//       } else if (subjects?.length) {
//         editableParams.push(subjects); // $2
//         idx++;
//         where += ` AND eq.subject_id = ANY($${idx})`;
//       }

//       if (excludeQuizIds.length) {
//         editableParams.push(excludeQuizIds); // next
//         idx++;
//         where += ` AND NOT (eq.id = ANY($${idx}::int[]))`;
//       }

//       editableParams.push(limit); // last param = LIMIT
//       const limitParam = `$${editableParams.length}`;

//       const sql = `
//         WITH answered AS (
//           SELECT question_id
//           FROM editing_quiz_answers
//           WHERE user_id = $1
//           GROUP BY question_id
//         )
//         SELECT 
//           eq.id AS quiz_id,
//           eq.title,
//           eq.passage,
//           eq.grade_id,
//           eq.subject_id,
//           eq.topic_id,
//           json_agg(
//             json_build_object(
//               'id', eqq.id,
//               'incorrect_word', eqq.incorrect_word,
//               'correct_word', eqq.correct_word,
//               'position', eqq.position
//             )
//             ORDER BY eqq.position
//           ) AS questions
//         FROM editing_quiz eq
//         JOIN editing_quiz_questions eqq ON eqq.quiz_id = eq.id
//         LEFT JOIN answered a ON a.question_id = eqq.id
//         WHERE ${where}
//         GROUP BY eq.id
//         HAVING COUNT(eqq.id) > 0
//         ORDER BY random()
//         LIMIT ${limitParam};
//       `;
//       const { rows } = await pool.query(sql, editableParams);
//       return rows.map(quiz => ({
//         id: quiz.quiz_id,
//         title: quiz.title,
//         passage: quiz.passage,
//         grade_id: quiz.grade_id,
//         subject_id: quiz.subject_id,
//         topic_id: quiz.topic_id,
//         questions: quiz.questions,
//         type: "editable",
//       }));
//     };

//     // ===== 3) Fetch NORMAL questions with filters/exclusions
//     const getNormal = async (limit, extraExcludedIds = []) => {
//       let sql = `
//         SELECT id, subject, topic_id, question_text, options, question_url,
//                answer_file_url, answer_explanation
//         FROM questions
//         WHERE NOT (id = ANY($1::int[]))
//       `;
//       const params = [answeredIds];

//       if (topics?.length) {
//         sql += ` AND topic_id = ANY($2::int[])`;
//         params.push(topics);
//       } else if (subjects?.length) {
//         // subjects are IDs; map to subject names like your original, or filter by name if your schema requires.
//         // If your 'questions.subject' is a text name, resolve names first (like your code does):
//         const subjectNameRes = await pool.query(
//           `SELECT subject FROM subjects WHERE id = ANY($1::int[])`,
//           [subjects]
//         );
//         const subjectNames = subjectNameRes.rows.map(r => r.subject.toLowerCase());
//         sql += ` AND LOWER(subject) = ANY($${params.length + 1})`;
//         params.push(subjectNames);
//       }

//       if (extraExcludedIds.length) {
//         sql += ` AND NOT (id = ANY($${params.length + 1}::int[]))`;
//         params.push(extraExcludedIds);
//       }

//       sql += ` ORDER BY random() LIMIT $${params.length + 1}`;
//       params.push(limit);

//       const { rows } = await pool.query(sql, params);
//       return rows.map(q => ({
//         id: q.id,
//         subject: q.subject,
//         topic_id: q.topic_id,
//         question_text: q.question_text,
//         options: q.options,
//         question_url: q.question_url,
//         answer_file_url: q.answer_file_url,
//         answer_explanation: q.answer_explanation,
//         type: "normal",
//       }));
//     };

//     // ---- First pass: target 2 editable, then fill remaining with normal
//     const editable1 = await getEditable({ limit: desiredEditable });
//     const normalNeeded = Math.max(MINI_TOTAL - editable1.length, 0);
//     const normal1 = await getNormal(normalNeeded);

//     let combined = [...editable1, ...normal1];

//     // ---- If still short, try topping up from whichever type can still supply
//     if (combined.length < MINI_TOTAL) {
//       const remaining = MINI_TOTAL - combined.length;

//       // Prefer topping up with NORMAL first
//       const alreadyNormalIds = normal1.map(n => n.id);
//       const normalTopUp = await getNormal(remaining, alreadyNormalIds);
//       combined = [...combined, ...normalTopUp];

//       // If still short, try more EDITABLE (exclude already picked quiz_ids)
//       if (combined.length < MINI_TOTAL) {
//         const remaining2 = MINI_TOTAL - combined.length;
//         const excludeQuizIds = editable1.map(e => e.id);
//         const editableTopUp = await getEditable({ limit: remaining2, excludeQuizIds });
//         combined = [...combined, ...editableTopUp];
//       }
//     }

//     // Shuffle
//     combined.sort(() => Math.random() - 0.5);

//     // ===== 4) Create mini session
//     const sessionRes = await pool.query(
//       `
//       INSERT INTO user_quiz_sessions 
//       (user_id, started_at, allowed_duration_seconds, total_questions, type)
//       VALUES ($1, now(), 150, $2, 'mini')
//       RETURNING *
//       `,
//       [userId, combined.length]
//     );

//     return res.status(200).json({
//       ok: true,
//       session: sessionRes.rows[0],
//       questions: combined,
//     });
//   } catch (err) {
//     console.error("startMiniQuiz error:", err);
//     return res.status(500).json({ ok: false, message: "Server error" });
//   }
// };

export const startMiniQuiz = async (req, res) => {
  try {

    const userId = req.userId;
    const { subjects } = req.body;

    const TOTAL = 5;

    const NORMAL_COUNT = 1;
    const EDITABLE_COUNT = 2;
    const COMPREHENSION_COUNT = 1;
    const CLOZE_COUNT = 1;

    // =====================================================
    // 1️⃣ Get Already Answered Question IDs
    // =====================================================
    const answeredRes = await pool.query(
      `
      SELECT DISTINCT a.question_id
      FROM user_answers a
      JOIN user_quiz_sessions s ON a.session_id = s.id
      WHERE s.user_id = $1
      `,
      [userId]
    );

    const answeredIds = answeredRes.rows.map(r => r.question_id);

    let selectedQuestions = [];

    // =====================================================
    // 2️⃣ COMPREHENSION GRAMMER
    // =====================================================
    const comprehensionRes = await pool.query(
      `
      SELECT *
      FROM questions
      WHERE question_type = 'grammar_cloze'
      AND NOT (id = ANY($1::int[]))
      ${subjects?.length ? `AND subject_id = ANY($2::int[])` : ``}
      ORDER BY random()
      LIMIT ${COMPREHENSION_COUNT}
      `,
      subjects?.length ? [answeredIds, subjects] : [answeredIds]
    );

    selectedQuestions.push(...comprehensionRes.rows);

    // =====================================================
    // 3️⃣ CLOZE
    // =====================================================
    const clozeRes = await pool.query(
      `
      SELECT *
      FROM questions
      WHERE question_type = 'comprehension_cloze'
      AND NOT (id = ANY($1::int[]))
      ${subjects?.length ? `AND subject_id = ANY($2::int[])` : ``}
      ORDER BY random()
      LIMIT ${CLOZE_COUNT}
      `,
      subjects?.length ? [answeredIds, subjects] : [answeredIds]
    );

    selectedQuestions.push(...clozeRes.rows);

    // =====================================================
    // 4️⃣ EDITABLE
    // =====================================================
    const editableRes = await pool.query(
      `
      SELECT *
      FROM questions
      WHERE question_type = 'editable'
      AND NOT (id = ANY($1::int[]))
      ${subjects?.length ? `AND subject_id = ANY($2::int[])` : ``}
      ORDER BY random()
      LIMIT ${EDITABLE_COUNT}
      `,
      subjects?.length ? [answeredIds, subjects] : [answeredIds]
    );

    selectedQuestions.push(...editableRes.rows);

    // =====================================================
    // 5️⃣ NORMAL
    // =====================================================
    const normalRes = await pool.query(
      `
      SELECT *
      FROM questions
      WHERE question_type = 'normal'
      AND NOT (id = ANY($1::int[]))
      ${subjects?.length ? `AND subject_id = ANY($2::int[])` : ``}
      ORDER BY random()
      LIMIT ${NORMAL_COUNT}
      `,
      subjects?.length ? [answeredIds, subjects] : [answeredIds]
    );

    selectedQuestions.push(...normalRes.rows);

    // =====================================================
    // 6️⃣ Fill Remaining If Any Type Missing
    // =====================================================
    const remaining = TOTAL - selectedQuestions.length;

    if (remaining > 0) {

      const existingIds = selectedQuestions.map(q => q.id);

      let query = `
        SELECT *
        FROM questions
        WHERE NOT (id = ANY($1::int[]))
        AND NOT (id = ANY($2::int[]))
      `;

      const params = [answeredIds, existingIds];

      if (subjects?.length) {
        params.push(subjects);
        query += ` AND subject_id = ANY($${params.length}::int[])`;
      }

      params.push(remaining);
      query += ` ORDER BY random() LIMIT $${params.length}`;

      const extraRes = await pool.query(query, params);

      selectedQuestions.push(...extraRes.rows);
    }

    // =====================================================
    // 7️⃣ Format Questions
    // =====================================================
    const formatted = selectedQuestions.map(q => {

      if (q.question_type === "editable") {
        return {
          id: q.id,
          title: q.extra_data?.title || "Untitled Quiz",
          passage: q.question_text,
          grade_id: q.grade_id,
          subject_id: q.subject_id,
          topic_id: q.topic_id,
          blanks: q.extra_data?.blanks || [],
          instructions: q.extra_data?.instructions || "",
          type: "editable"
        };
      }

      if (q.question_type === "grammar_cloze") {
        return {
          id: q.id,
          subject_id: q.subject_id,
          topic_id: q.topic_id,
          title: q.extra_data?.title || "Untitled",
          passage: q.question_text,
          options: q.extra_data?.options || [],
          correctAnswers: q.extra_data?.correctAnswers || {},
          type: "grammar_cloze"
        };
      }

      if (q.question_type === "comprehension_cloze") {
        return {
          id: q.id,
          subject_id: q.subject_id,
          topic_id: q.topic_id,
          title: q.extra_data?.title || "Untitled",
          passage: q.question_text,
          correctAnswers: q.extra_data?.correctAnswers || {},
          type: "comprehension_cloze"
        };
      }

      return {
        id: q.id,
        subject_id: q.subject_id,
        topic_id: q.topic_id,
        question_text: q.question_text,
        options: q.options,
        question_url: q.question_url,
        answer_file_url: q.answer_file_url,
        answer_explanation: q.answer_explanation,
        type: "normal"
      };

    });

    // =====================================================
    // 8️⃣ Shuffle
    // =====================================================
    const shuffled = formatted.sort(() => Math.random() - 0.5);

    // =====================================================
    // 9️⃣ Create Session
    // =====================================================
    const sessionRes = await pool.query(
      `
      INSERT INTO user_quiz_sessions
      (user_id, started_at, allowed_duration_seconds, total_questions, type)
      VALUES ($1, NOW(), 150, $2, 'mini')
      RETURNING *
      `,
      [userId, shuffled.length]
    );

    return res.status(200).json({
      ok: true,
      session: sessionRes.rows[0],
      questions: shuffled
    });

  } catch (err) {

    console.error("startMiniQuiz error:", err);

    return res.status(500).json({
      ok: false,
      message: "Server error"
    });

  }
};

// revision quiz..........

export const startRevisionQuiz = async (req, res) => {
  try {
    const userId = req.userId;
    const { subjects, topics } = req.body;

    const TOTAL = 30;
    const desiredEditable = 15;
    const desiredNormal = TOTAL - desiredEditable;

    // ==========================================================
    // 1️⃣ Get previously answered IDs
    // ==========================================================
    const answeredNormalRes = await pool.query(
      `SELECT question_id FROM user_answered_questions WHERE user_id=$1`,
      [userId]
    );
    const answeredNormalIds = answeredNormalRes.rows.map(r => r.question_id);

    const answeredEditableRes = await pool.query(
      `SELECT question_id FROM editing_quiz_answers WHERE user_id=$1`,
      [userId]
    );
    const answeredEditableIds = answeredEditableRes.rows.map(r => r.question_id);

    if (answeredNormalIds.length === 0 && answeredEditableIds.length === 0) {
      return res.json({ ok: true, session: null, questions: [] });
    }

    // ==========================================================
    // 2️⃣ Fetch EDITABLE revision passages
    // ==========================================================
    const getEditableAnswered = async ({ limit, excludeQuizIds = [] }) => {

      if (answeredEditableIds.length === 0) return [];

      let sql = `
        SELECT 
          eq.id AS quiz_id,
          eq.title,
          eq.passage,
          eq.grade_id,
          eq.subject_id,
          eq.topic_id,
          json_agg(
            json_build_object(
              'id', eqq.id,
              'incorrect_word', eqq.incorrect_word,
              'correct_word',  eqq.correct_word,
              'position',      eqq.position
            )
            ORDER BY eqq.position
          ) AS questions
        FROM editing_quiz eq
        JOIN editing_quiz_questions eqq ON eqq.quiz_id = eq.id
        WHERE eqq.id = ANY($1::int[])
      `;

      const params = [answeredEditableIds];
      let idx = 2;

      if (topics?.length) {
        sql += ` AND eq.topic_id = ANY($${idx}::int[])`;
        params.push(topics);
        idx++;
      } else if (subjects?.length) {
        sql += ` AND eq.subject_id = ANY($${idx}::int[])`;
        params.push(subjects);
        idx++;
      }

      if (excludeQuizIds.length > 0) {
        sql += ` AND eq.id <> ALL($${idx}::int[])`;
        params.push(excludeQuizIds);
        idx++;
      }

      sql += `
        GROUP BY eq.id
        HAVING COUNT(eqq.id) > 0
        ORDER BY random()
        LIMIT $${idx}
      `;
      params.push(limit);

      const { rows } = await pool.query(sql, params);

      return rows.map(quiz => ({
        id: quiz.quiz_id,
        title: quiz.title,
        passage: quiz.passage,
        grade_id: quiz.grade_id,
        subject_id: quiz.subject_id,
        topic_id: quiz.topic_id,
        questions: quiz.questions,
        type: "editable",
      }));
    };

    // ==========================================================
    // 3️⃣ Fetch NORMAL revision questions
    // ==========================================================
    const getNormalAnswered = async (limit, extraExcludedIds = []) => {

      if (answeredNormalIds.length === 0) return [];

      let sql = `
        SELECT id, subject, topic_id, question_text, options,
               question_url, answer_file_url, answer_explanation
        FROM questions
        WHERE id = ANY($1::int[])
      `;

      const params = [answeredNormalIds];
      let idx = 2;

      if (topics?.length) {
        sql += ` AND topic_id = ANY($${idx}::int[])`;
        params.push(topics);
        idx++;
      } else if (subjects?.length) {
        sql += `
          AND subject IN (
            SELECT subject FROM subjects WHERE id = ANY($${idx}::int[])
          )
        `;
        params.push(subjects);
        idx++;
      }

      if (extraExcludedIds.length > 0) {
        sql += ` AND id <> ALL($${idx}::int[])`;
        params.push(extraExcludedIds);
        idx++;
      }

      sql += ` ORDER BY random() LIMIT $${idx}`;
      params.push(limit);

      const { rows } = await pool.query(sql, params);

      return rows.map(q => ({
        id: q.id,
        subject: q.subject,
        topic_id: q.topic_id,
        question_text: q.question_text,
        options: q.options,
        question_url: q.question_url,
        answer_file_url: q.answer_file_url,
        answer_explanation: q.answer_explanation,
        type: "normal",
      }));
    };

    // ==========================================================
    // 4️⃣ First pass
    // ==========================================================
    const editable1 = await getEditableAnswered({ limit: desiredEditable });
    const normal1 = await getNormalAnswered(desiredNormal);

    let combined = [...editable1, ...normal1];

    // ==========================================================
    // 5️⃣ Top-up if needed
    // ==========================================================
    if (combined.length < TOTAL) {
      const remaining = TOTAL - combined.length;

      const normalExtra = await getNormalAnswered(
        remaining,
        normal1.map(n => n.id)
      );

      combined = [...combined, ...normalExtra];

      if (combined.length < TOTAL) {
        const remaining2 = TOTAL - combined.length;

        const editableExtra = await getEditableAnswered({
          limit: remaining2,
          excludeQuizIds: editable1.map(e => e.id),
        });

        combined = [...combined, ...editableExtra];
      }
    }

    // ==========================================================
    // 6️⃣ Shuffle
    // ==========================================================
    combined.sort(() => Math.random() - 0.5);

    // ==========================================================
    // 7️⃣ Create Session
    // ==========================================================
    const sessionRes = await pool.query(
      `
      INSERT INTO user_quiz_sessions 
      (user_id, started_at, allowed_duration_seconds, total_questions, type)
      VALUES ($1, now(), 300, $2, 'revision')
      RETURNING *
      `,
      [userId, combined.length]
    );

    return res.status(200).json({
      ok: true,
      session: sessionRes.rows[0],
      questions: combined,
    });

  } catch (err) {
    console.error("startRevisionQuiz error:", err);
    return res.status(500).json({
      ok: false,
      message: "Server error",
    });
  }
};
