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

    const all7 = Object.keys(weekMap).length === 7 &&
      Object.values(weekMap).every(e => e.correct_count + e.incorrect_count > 0);

    // ✅ Monthly stats
    const monthRes = await pool.query(
      `SELECT SUM(correct_count) as correct, SUM(incorrect_count) as incorrect
       FROM user_activity 
       WHERE user_id = $1 
         AND date_trunc('month', activity_date) = date_trunc('month', current_date)`,
      [userId]
    );

    const month = monthRes.rows[0] || { correct: 0, incorrect: 0 };
    const completedThisMonth = +(month.correct || 0) + +(month.incorrect || 0);

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
        } else if (activityDate.getTime() === currentDate.getTime() - 24 * 60 * 60 * 1000) {
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
      monthly: { completed: completedThisMonth, target: 25 },
      streakCount
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: 'Server error' });
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

    // ============================================
    // 1️⃣ Get user daily limit
    // ============================================
    const userRes = await pool.query(
      "SELECT questions_per_day FROM users WHERE id = $1",
      [userId]
    );

    const qpd = userRes.rows[0]?.questions_per_day || 10;

    const halfNormal = Math.ceil(qpd / 2);
    const halfEditable = Math.floor(qpd / 2);

    // ============================================
    // 2️⃣ Already answered NORMAL questions
    // ============================================
    const answeredNormalRes = await pool.query(
      "SELECT question_id FROM user_answered_questions WHERE user_id = $1",
      [userId]
    );

    const answeredNormalIds = answeredNormalRes.rows.map(r => r.question_id);

    // ============================================
    // 3️⃣ Fetch NORMAL questions
    // ============================================
    let normalQuery = `
      SELECT id, subject, topic_id, question_text, options,
             question_url, answer_file_url, answer_explanation
      FROM questions
      WHERE question_type != 'editable'
      AND NOT (id = ANY($1::int[]))
    `;

    const normalParams = [answeredNormalIds];

    if (subjects?.length) {
      normalQuery += ` AND subject_id = ANY($${normalParams.length + 1}::int[])`;
      normalParams.push(subjects);
    }

    normalQuery += ` ORDER BY random() LIMIT $${normalParams.length + 1}`;
    normalParams.push(halfNormal);

    const normalRes = await pool.query(normalQuery, normalParams);

    // ============================================
    // 4️⃣ Already answered EDITABLE quizzes
    // ============================================
    const answeredEditableRes = await pool.query(
      "SELECT question_id FROM editing_quiz_answers WHERE user_id = $1 GROUP BY question_id",
      [userId]
    );

    const answeredEditableIds = answeredEditableRes.rows.map(r => r.question_id);

    // ============================================
    // 5️⃣ Fetch EDITABLE quizzes (from questions table)
    // ============================================
    let editableQuery = `
      SELECT id,
             question_text,
             grade_id,
             subject_id,
             topic_id,
             extra_data
      FROM questions
      WHERE question_type = 'editable'
      AND NOT (id = ANY($1::int[]))
    `;

    const editableParams = [answeredEditableIds];

    if (subjects?.length) {
      editableQuery += ` AND subject_id = ANY($${editableParams.length + 1}::int[])`;
      editableParams.push(subjects);
    }

    editableQuery += ` ORDER BY random() LIMIT $${editableParams.length + 1}`;
    editableParams.push(halfEditable);

    const editableRes = await pool.query(editableQuery, editableParams);

    // ============================================
    // 6️⃣ Format NORMAL questions
    // ============================================
    const normalQuestions = normalRes.rows.map(q => ({
      id: q.id,
      subject: q.subject,
      topic_id: q.topic_id,
      question_text: q.question_text,
      options: q.options,
      question_url: q.question_url,
      answer_file_url: q.answer_file_url,
      answer_explanation: q.answer_explanation,
      type: "normal"
    }));

    // ============================================
    // 7️⃣ Format EDITABLE quizzes
    // ============================================
    const editableQuizzes = editableRes.rows.map(q => ({
      id: q.id,
      title: q.extra_data?.title || "Untitled Quiz",
      passage: q.question_text,
      grade_id: q.grade_id,
      subject_id: q.subject_id,
      topic_id: q.topic_id,
      blanks: q.extra_data?.blanks || [],
      type: "editable"
    }));

    // ============================================
    // 8️⃣ Combine & Shuffle
    // ============================================
    const combinedQuestions = [...normalQuestions, ...editableQuizzes]
      .sort(() => Math.random() - 0.5);

    // ============================================
    // 9️⃣ Create Session
    // ============================================
    const sessionRes = await pool.query(
      `
      INSERT INTO user_quiz_sessions
      (user_id, started_at, allowed_duration_seconds, total_questions, type)
      VALUES ($1, NOW(), 300, $2, 'mixed')
      RETURNING *
      `,
      [userId, combinedQuestions.length]
    );

    const session = sessionRes.rows[0];

    // ============================================
    // 🔟 Response
    // ============================================
    return res.status(200).json({
      ok: true,
      session,
      questions: combinedQuestions
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
    const { subjects } = req.body;

    // ============================================
    // 1️⃣ Get daily question limit
    // ============================================
    const userRes = await pool.query(
      "SELECT questions_per_day FROM users WHERE id = $1",
      [userId]
    );

    const qpd = userRes.rows[0]?.questions_per_day || 10;

    const halfNormal = Math.ceil(qpd / 2);
    const halfEditable = Math.floor(qpd / 2);

    // ============================================
    // 2️⃣ Already answered NORMAL questions
    // ============================================
    const answeredNormalRes = await pool.query(
      "SELECT question_id FROM user_answered_questions WHERE user_id = $1",
      [userId]
    );

    const answeredNormalIds =
      answeredNormalRes.rows.map(r => r.question_id);

    // ============================================
    // 3️⃣ Fetch NORMAL questions
    // ============================================
    let normalQuery = `
      SELECT id, subject, topic_id, question_text, options,
             question_url, answer_file_url, answer_explanation
      FROM questions
      WHERE question_type != 'editable'
      AND NOT (id = ANY($1::int[]))
    `;

    const normalParams = [answeredNormalIds];

    if (subjects?.length) {
      normalQuery += ` AND subject_id = ANY($${normalParams.length + 1}::int[])`;
      normalParams.push(subjects);
    }

    normalQuery += ` ORDER BY random() LIMIT $${normalParams.length + 1}`;
    normalParams.push(halfNormal);

    const normalRes = await pool.query(normalQuery, normalParams);

    // ============================================
    // 4️⃣ Already answered EDITABLE quizzes
    // ============================================
    const answeredEditableRes = await pool.query(
      "SELECT question_id FROM editing_quiz_answers WHERE user_id = $1 GROUP BY question_id",
      [userId]
    );

    const answeredEditableIds =
      answeredEditableRes.rows.map(r => r.question_id);

    // ============================================
    // 5️⃣ Fetch EDITABLE quizzes
    // ============================================
    let editableQuery = `
      SELECT id,
             question_text,
             grade_id,
             subject_id,
             topic_id,
             extra_data
      FROM questions
      WHERE question_type = 'editable'
      AND NOT (id = ANY($1::int[]))
    `;

    const editableParams = [answeredEditableIds];

    if (subjects?.length) {
      editableQuery += ` AND subject_id = ANY($${editableParams.length + 1}::int[])`;
      editableParams.push(subjects);
    }

    editableQuery += ` ORDER BY random() LIMIT $${editableParams.length + 1}`;
    editableParams.push(halfEditable);

    const editableRes = await pool.query(editableQuery, editableParams);

    // ============================================
    // 6️⃣ Format NORMAL questions
    // ============================================
    const normalQuestions = normalRes.rows.map(q => ({
      id: q.id,
      subject: q.subject,
      topic_id: q.topic_id,
      question_text: q.question_text,
      options: q.options,
      question_url: q.question_url,
      answer_file_url: q.answer_file_url,
      answer_explanation: q.answer_explanation,
      type: "normal"
    }));

    // ============================================
    // 7️⃣ Format EDITABLE quizzes
    // ============================================
    const editableQuizzes = editableRes.rows.map(q => ({
      id: q.id,
      title: q.extra_data?.title || "Untitled Quiz",
      passage: q.question_text,
      grade_id: q.grade_id,
      subject_id: q.subject_id,
      topic_id: q.topic_id,
      blanks: q.extra_data?.blanks || [],
      type: "editable"
    }));

    // ============================================
    // 8️⃣ Combine & Shuffle
    // ============================================
    const combinedQuestions =
      [...normalQuestions, ...editableQuizzes]
        .sort(() => Math.random() - 0.5);

    // ============================================
    // 9️⃣ Insert Daily Quiz Session
    // ============================================
    const sessionRes = await pool.query(
      `
      INSERT INTO user_quiz_sessions
      (user_id, started_at, allowed_duration_seconds, total_questions, type)
      VALUES ($1, NOW(), 300, $2, 'daily')
      RETURNING *
      `,
      [userId, combinedQuestions.length]
    );

    const session = sessionRes.rows[0];

    // ============================================
    // 🔟 Response
    // ============================================
    return res.status(200).json({
      ok: true,
      session,
      questions: combinedQuestions
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

    const TOTAL_QUESTIONS = 30;
    const NORMAL_COUNT = 15;
    const EDITABLE_COUNT = 15;

    // ==========================================================
    // 1️⃣ Get Already Answered Normal Questions
    // ==========================================================
    const answeredRes = await pool.query(
      `SELECT question_id 
       FROM user_answered_questions 
       WHERE user_id = $1`,
      [userId]
    );

    const answeredIds = answeredRes.rows.map(r => r.question_id);

    // ==========================================================
    // 2️⃣ Fetch NORMAL Questions
    // ==========================================================
    let normalQuery = `
      SELECT 
        id,
        subject_id,
        topic_id,
        question_text,
        options,
        question_url,
        answer_file_url,
        answer_explanation
      FROM questions
      WHERE question_type = 'normal'
    `;

    const normalParams = [];
    let paramIndex = 1;

    if (answeredIds.length > 0) {
      normalQuery += ` AND id <> ALL($${paramIndex}::int[])`;
      normalParams.push(answeredIds);
      paramIndex++;
    }

    if (subjects?.length) {
      normalQuery += ` AND subject_id = ANY($${paramIndex}::int[])`;
      normalParams.push(subjects);
      paramIndex++;
    }

    normalQuery += ` ORDER BY random() LIMIT $${paramIndex}`;
    normalParams.push(NORMAL_COUNT);

    const normalRes = await pool.query(normalQuery, normalParams);

    // ==========================================================
    // 3️⃣ Fetch EDITABLE Quizzes (Single Table)
    // ==========================================================
    let editableQuery = `
      SELECT 
        id,
        question_text,
        grade_id,
        subject_id,
        topic_id,
        extra_data
      FROM questions
      WHERE question_type = 'editable'
    `;

    const editableParams = [];
    let editParamIndex = 1;

    if (subjects?.length) {
      editableQuery += ` AND subject_id = ANY($${editParamIndex}::int[])`;
      editableParams.push(subjects);
      editParamIndex++;
    }

    editableQuery += ` ORDER BY random() LIMIT $${editParamIndex}`;
    editableParams.push(EDITABLE_COUNT);

    const editableRes = await pool.query(editableQuery, editableParams);

    // ==========================================================
    // 4️⃣ Format Questions
    // ==========================================================
    const normalQuestions = normalRes.rows.map(q => ({
      id: q.id,
      subject_id: q.subject_id,
      topic_id: q.topic_id,
      question_text: q.question_text,
      options: q.options,
      question_url: q.question_url,
      answer_file_url: q.answer_file_url,
      answer_explanation: q.answer_explanation,
      type: "normal",
    }));

    const editableQuizzes = editableRes.rows.map(q => ({
      id: q.id,
      title: q.extra_data?.quiz_title || "Untitled Quiz",
      passage: q.question_text,
      grade_id: q.grade_id,
      subject_id: q.subject_id,
      topic_id: q.topic_id,
      questions: q.extra_data?.words || [],
      type: "editable",
    }));

    // ==========================================================
    // 5️⃣ Merge & Shuffle
    // ==========================================================
    const combinedQuestions = [...normalQuestions, ...editableQuizzes]
      .sort(() => Math.random() - 0.5);

    // ==========================================================
    // 6️⃣ Create Session
    // ==========================================================
    const sessionRes = await pool.query(
      `INSERT INTO user_quiz_sessions
       (user_id, started_at, allowed_duration_seconds, total_questions, type)
       VALUES ($1, NOW(), 300, $2, 'big')
       RETURNING *`,
      [userId, combinedQuestions.length]
    );

    return res.status(200).json({
      ok: true,
      session: sessionRes.rows[0],
      questions: combinedQuestions,
    });

  } catch (err) {
    console.error("startbigQuiz error:", err);
    return res.status(500).json({
      ok: false,
      message: "Server error",
    });
  }
};


// submit answers for a session.......

export const submitAnswers = async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = req.userId;
    const { session_id, answers } = req.body;

    if (!session_id || !Array.isArray(answers)) {
      return res.status(400).json({
        ok: false,
        message: "Invalid payload",
      });
    }

    await client.query("BEGIN");

    // ==========================================================
    // 1️⃣ Validate session
    // ==========================================================
    const sessionRes = await client.query(
      `SELECT id FROM user_quiz_sessions 
       WHERE id=$1 AND user_id=$2`,
      [session_id, userId]
    );

    if (!sessionRes.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        ok: false,
        message: "Session not found",
      });
    }

    let correctCount = 0;
    let totalCount = 0;

    // ==========================================================
    // 2️⃣ Separate Normal & Editable
    // ==========================================================
    const normalAnswers = [];
    const editableAnswersByQuiz = {};

    for (const ans of answers) {
      if (ans.type === "normal") {
        normalAnswers.push(ans);
      } else if (ans.type === "editable") {
        if (!editableAnswersByQuiz[ans.quiz_id]) {
          editableAnswersByQuiz[ans.quiz_id] = [];
        }
        editableAnswersByQuiz[ans.quiz_id].push(ans);
      }
    }

    // ==========================================================
    // 3️⃣ PROCESS NORMAL QUESTIONS (Bulk Fetch)
    // ==========================================================
    if (normalAnswers.length > 0) {
      const questionIds = normalAnswers.map(a => a.question_id);

      const questionRes = await client.query(
        `SELECT id, correct_option_id 
         FROM questions
         WHERE id = ANY($1::int[])`,
        [questionIds]
      );

      const correctMap = {};
      questionRes.rows.forEach(row => {
        correctMap[row.id] = row.correct_option_id;
      });

      for (const ans of normalAnswers) {
        totalCount++;

        const correctOption = correctMap[ans.question_id];
        if (!correctOption) continue;

        const is_correct =
          Number(correctOption) === Number(ans.selected_option_id);

        if (is_correct) correctCount++;

        await client.query(
          `INSERT INTO user_answers
           (session_id, question_id, selected_option_id, is_correct, answered_at)
           VALUES ($1,$2,$3,$4,NOW())
           ON CONFLICT (session_id, question_id)
           DO UPDATE SET
             selected_option_id = EXCLUDED.selected_option_id,
             is_correct = EXCLUDED.is_correct,
             answered_at = NOW()`,
          [
            session_id,
            ans.question_id,
            ans.selected_option_id,
            is_correct,
          ]
        );

        await client.query(
          `INSERT INTO user_answered_questions
           (user_id, question_id, answered_at)
           VALUES ($1,$2,NOW())
           ON CONFLICT (user_id, question_id) DO NOTHING`,
          [userId, ans.question_id]
        );
      }
    }

    // ==========================================================
    // 4️⃣ PROCESS EDITABLE QUIZZES (JSONB STRUCTURE)
    // ==========================================================
    for (const quizId in editableAnswersByQuiz) {
      totalCount++;

      const quizRes = await client.query(
        `SELECT extra_data
         FROM questions
         WHERE id=$1
         AND question_type='editable'`,
        [quizId]
      );

      if (!quizRes.rowCount) continue;

      const words = quizRes.rows[0].extra_data?.words || [];

      const correctMap = {};
      words.forEach(word => {
        correctMap[word.id] = word.correct_word;
      });

      let allCorrect = true;

      for (const ans of editableAnswersByQuiz[quizId]) {
        const correctWord =
          (correctMap[ans.question_id] || "")
            .toString()
            .trim()
            .toLowerCase();

        const userWord =
          (ans.provided_word || "")
            .toString()
            .trim()
            .toLowerCase();

        const is_correct = correctWord === userWord;

        if (!is_correct) {
          allCorrect = false;
        }

        await client.query(
          `INSERT INTO editing_quiz_answers
           (user_id, quiz_id, word_id, user_answer, is_correct, session_id, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
          [
            userId,
            quizId,
            ans.question_id, // word.id from JSON
            ans.provided_word,
            is_correct,
            session_id,
          ]
        );
      }

      // Editable quiz counts as 1 mark
      if (allCorrect) {
        correctCount++;
      }
    }

    // ==========================================================
    // 5️⃣ Update Session
    // ==========================================================
    const sessionUpdate = await client.query(
      `UPDATE user_quiz_sessions
       SET finished_at = NOW(),
           score = $1
       WHERE id = $2
       RETURNING *`,
      [correctCount, session_id]
    );

    const incorrectCount = totalCount - correctCount;

    // ==========================================================
    // 6️⃣ Update Activity
    // ==========================================================
    await client.query(
      `INSERT INTO user_activity
       (user_id, activity_date, correct_count, incorrect_count)
       VALUES ($1, CURRENT_DATE, $2, $3)
       ON CONFLICT (user_id, activity_date)
       DO UPDATE SET
         correct_count = user_activity.correct_count + $2,
         incorrect_count = user_activity.incorrect_count + $3`,
      [userId, correctCount, incorrectCount]
    );

    await client.query("COMMIT");

    // 🔔 Notification (outside transaction)
    await NotificationService.generateQuizCompletionNotifications(
      userId,
      session_id
    );

    const percentage =
      totalCount === 0
        ? 0
        : Math.round((correctCount / totalCount) * 100);

    return res.json({
      ok: true,
      score: correctCount,
      total: totalCount,
      percentage,
      data: sessionUpdate.rows[0],
      message: `🎯 Quiz completed! You scored ${correctCount}/${totalCount} (${percentage}%).`,
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Submit error:", err);
    return res.status(500).json({
      ok: false,
      message: "Server error",
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

    // ==========================================================
    // 1️⃣ Validate Session
    // ==========================================================
    const sessionRes = await pool.query(
      `SELECT * FROM user_quiz_sessions 
       WHERE id=$1 AND user_id=$2`,
      [sessionId, userId]
    );

    if (!sessionRes.rowCount) {
      return res.status(404).json({
        ok: false,
        message: "Session not found",
      });
    }

    const session = sessionRes.rows[0];

    // ==========================================================
    // 2️⃣ Fetch Normal Question Answers
    // ==========================================================
    const normalRes = await pool.query(
      `SELECT 
          ua.question_id,
          ua.selected_option_id,
          ua.is_correct,
          q.question_text,
          q.options,
          q.correct_option_id,
          q.question_url,
          q.answer_file_url,
          q.answer_explanation
       FROM user_answers ua
       JOIN questions q ON q.id = ua.question_id
       WHERE ua.session_id = $1`,
      [sessionId]
    );

    const normalAnswers = normalRes.rows.map(r => ({
      type: "normal",
      question_id: r.question_id,
      question_text: r.question_text,
      options: r.options,
      selected_option_id: r.selected_option_id,
      correct_option_id: r.correct_option_id,
      is_correct: r.is_correct,
      question_url: r.question_url,
      answer_file_url: r.answer_file_url,
      answer_explanation: r.answer_explanation,
    }));

    // ==========================================================
    // 3️⃣ Fetch Editable Answers
    // ==========================================================
    const editableRes = await pool.query(
      `SELECT 
          ea.quiz_id,
          ea.word_id,
          ea.user_answer,
          ea.is_correct
       FROM editing_quiz_answers ea
       WHERE ea.user_id = $1 
       AND ea.session_id = $2`,
      [userId, sessionId]
    );

    // Group answers by quiz_id
    const editableGrouped = {};
    editableRes.rows.forEach(row => {
      if (!editableGrouped[row.quiz_id]) {
        editableGrouped[row.quiz_id] = [];
      }
      editableGrouped[row.quiz_id].push(row);
    });

    const editableAnswers = [];

    // ==========================================================
    // 4️⃣ Rebuild Editable Quiz Review from JSONB
    // ==========================================================
    for (const quizId in editableGrouped) {
      const quizRes = await pool.query(
        `SELECT question_text, extra_data
         FROM questions
         WHERE id=$1 AND question_type='editable'`,
        [quizId]
      );

      if (!quizRes.rowCount) continue;

      const quiz = quizRes.rows[0];
      const words = quiz.extra_data?.words || [];

      const correctMap = {};
      words.forEach(w => {
        correctMap[w.id] = {
          correct_word: w.correct_word,
          position: w.position
        };
      });

      const wordAnswers = editableGrouped[quizId].map(ans => ({
        word_id: ans.word_id,
        user_answer: ans.user_answer,
        correct_word: correctMap[ans.word_id]?.correct_word || null,
        position: correctMap[ans.word_id]?.position || null,
        is_correct: ans.is_correct
      }));

      editableAnswers.push({
        type: "editable",
        quiz_id: quizId,
        passage: quiz.question_text,
        words: wordAnswers
      });
    }

    // ==========================================================
    // 5️⃣ Final Response
    // ==========================================================
    return res.json({
      ok: true,
      session,
      totalAnswers: normalAnswers.length + editableAnswers.length,
      normal: normalAnswers,
      editable: editableAnswers,
    });

  } catch (err) {
    console.error("reviewSession error:", err);
    return res.status(500).json({
      ok: false,
      message: "Server error",
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

    const MINI_TOTAL = 5;
    const desiredEditable = 2;
    const desiredNormal = MINI_TOTAL - desiredEditable;

    // ==========================================================
    // 1️⃣ Get already answered normal questions
    // ==========================================================
    const answeredRes = await pool.query(
      `SELECT question_id FROM user_answered_questions WHERE user_id = $1`,
      [userId]
    );
    const answeredIds = answeredRes.rows.map(r => r.question_id);

    // ==========================================================
    // 2️⃣ Fetch EDITABLE quizzes
    // ==========================================================
    const getEditable = async ({ limit, excludeQuizIds = [] }) => {
      let sql = `
        WITH answered AS (
          SELECT question_id
          FROM editing_quiz_answers
          WHERE user_id = $1
        )
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
              'correct_word', eqq.correct_word,
              'position', eqq.position
            )
            ORDER BY eqq.position
          ) AS questions
        FROM editing_quiz eq
        JOIN editing_quiz_questions eqq ON eqq.quiz_id = eq.id
        LEFT JOIN answered a ON a.question_id = eqq.id
        WHERE a.question_id IS NULL
      `;

      const params = [userId];
      let idx = 2;

      if (subjects?.length) {
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
    // 3️⃣ Fetch NORMAL questions
    // ==========================================================
    const getNormal = async (limit, extraExcludedIds = []) => {
      let sql = `
        SELECT 
          id, subject, topic_id, question_text, options,
          question_url, answer_file_url, answer_explanation
        FROM questions
        WHERE 1=1
      `;

      const params = [];
      let idx = 1;

      // ✅ Safe exclusion only if answered exists
      if (answeredIds.length > 0) {
        sql += ` AND id <> ALL($${idx}::int[])`;
        params.push(answeredIds);
        idx++;
      }

      if (subjects?.length) {
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
    // 4️⃣ First Fetch
    // ==========================================================
    const editable1 = await getEditable({ limit: desiredEditable });

    const normalNeeded = Math.max(
      MINI_TOTAL - editable1.length,
      0
    );

    const normal1 = await getNormal(normalNeeded);

    let combined = [...editable1, ...normal1];

    // ==========================================================
    // 5️⃣ Top-up Logic
    // ==========================================================
    if (combined.length < MINI_TOTAL) {
      const remaining = MINI_TOTAL - combined.length;

      const alreadyNormalIds = normal1.map(n => n.id);

      const normalTopUp = await getNormal(remaining, alreadyNormalIds);
      combined = [...combined, ...normalTopUp];

      if (combined.length < MINI_TOTAL) {
        const remaining2 = MINI_TOTAL - combined.length;
        const excludeQuizIds = editable1.map(e => e.id);

        const editableTopUp = await getEditable({
          limit: remaining2,
          excludeQuizIds,
        });

        combined = [...combined, ...editableTopUp];
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
      VALUES ($1, now(), 150, $2, 'mini')
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
    console.error("startMiniQuiz error:", err);
    return res.status(500).json({
      ok: false,
      message: "Server error",
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
