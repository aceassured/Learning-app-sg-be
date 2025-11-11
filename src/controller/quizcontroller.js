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



// start quiz: create session, fetch N questions according to user settings

// export const startQuiz = async (req, res) => {
//   try {
//     const userId = req.userId;
//     const userRes = await pool.query('SELECT questions_per_day FROM users WHERE id=$1', [userId]);
//     const qpd = userRes.rows[0]?.questions_per_day || 10;
//     const qRes = await pool.query(`SELECT id, question_text, options FROM questions ORDER BY random() LIMIT $1`, [qpd]);
//     const questions = qRes.rows;

//     const sessionRes = await pool.query(
//       `INSERT INTO user_quiz_sessions (user_id, started_at, allowed_duration_seconds, total_questions)
//        VALUES ($1, now(), 300, $2) RETURNING *`,
//       [userId, questions.length]
//     );

//     const session = sessionRes.rows[0];

//     res.json({ ok:true, session, questions });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ ok:false, message:'Server error' });
//   }
// };


// start quiz........

// export const startQuiz = async (req, res) => {
//   try {
//     const userId = req.userId;
//     const { subjects, topics } = req.body; // subjects = [id...], topics = [id...]

//     // Get questions_per_day from users table
//     const userRes = await pool.query(
//       "SELECT questions_per_day FROM users WHERE id=$1",
//       [userId]
//     );
//     const qpd = userRes.rows[0]?.questions_per_day || 10;

//     let qRes;

//     if (topics && topics.length > 0) {
//       // 🎯 Filter by topic IDs
//       qRes = await pool.query(
//         `
//         SELECT id, subject, topic_id, question_text, options, question_url, 
//                answer_file_url, answer_explanation
//         FROM questions 
//         WHERE topic_id = ANY($1::int[]) 
//         ORDER BY random() 
//         LIMIT $2
//         `,
//         [topics, qpd]
//       );
//     } else if (subjects && subjects.length > 0) {
//       // 🎯 Fallback: Filter by subject IDs
//       const subjectNameRes = await pool.query(
//         "SELECT subject FROM subjects WHERE id = ANY($1)",
//         [subjects]
//       );
//       const subjectNames = subjectNameRes.rows.map((row) => row.subject.toLowerCase());

//       qRes = await pool.query(
//         `
//         SELECT id, subject, topic_id, question_text, options, question_url, 
//                answer_file_url, answer_explanation
//         FROM questions 
//         WHERE LOWER(subject) = ANY($1) 
//         ORDER BY random() 
//         LIMIT $2
//         `,
//         [subjectNames, qpd]
//       );
//     } else {
//       // 🎯 Default: random questions from all subjects
//       qRes = await pool.query(
//         `
//         SELECT id, subject, topic_id, question_text, options, question_url, 
//                answer_file_url, answer_explanation
//         FROM questions 
//         ORDER BY random() 
//         LIMIT $1
//         `,
//         [qpd]
//       );
//     }

//     const questions = qRes.rows;

//     // Insert into user_quiz_sessions
//     const sessionRes = await pool.query(
//       `
//       INSERT INTO user_quiz_sessions 
//       (user_id, started_at, allowed_duration_seconds, total_questions)
//       VALUES ($1, now(), 300, $2)
//       RETURNING *
//       `,
//       [userId, questions.length]
//     );

//     const session = sessionRes.rows[0];

//     res.json({ ok: true, session, questions });
//   } catch (err) {
//     console.error("startQuiz error:", err);
//     res.status(500).json({ ok: false, message: "Server error" });
//   }
// };


//  working quiz start.............

// export const startQuiz = async (req, res) => {
//   try {
//     const userId = req.userId;
//     const { subjects, topics } = req.body; // subjects = [id...], topics = [id...]

//     // ✅ Get user's questions_per_day
//     const userRes = await pool.query(
//       "SELECT questions_per_day FROM users WHERE id=$1",
//       [userId]
//     );
//     const qpd = userRes.rows[0]?.questions_per_day || 10;

//     console.log("question per day", qpd)
//     // ✅ Already answered question_ids
//     const answeredRes = await pool.query(
//       "SELECT question_id FROM user_answered_questions WHERE user_id=$1",
//       [userId]
//     );
//     const answeredIds = answeredRes.rows.map((r) => r.question_id);

//     let qRes;

//     if (topics && topics.length > 0) {
//       // 🎯 Pick by topics, exclude answered
//       qRes = await pool.query(
//         `
//         SELECT id, subject, topic_id, question_text, options, question_url, 
//                answer_file_url, answer_explanation
//         FROM questions 
//         WHERE topic_id = ANY($1::int[])
//           AND NOT (id = ANY($2::int[]))
//         ORDER BY random()
//         LIMIT $3
//         `,
//         [topics, answeredIds, qpd]
//       );
//     } else if (subjects && subjects.length > 0) {
//       // 🎯 Pick by subjects, exclude answered
//       const subjectNameRes = await pool.query(
//         "SELECT subject FROM subjects WHERE id = ANY($1)",
//         [subjects]
//       );
//       const subjectNames = subjectNameRes.rows.map((row) =>
//         row.subject.toLowerCase()
//       );

//       qRes = await pool.query(
//         `
//         SELECT id, subject, topic_id, question_text, options, question_url, 
//                answer_file_url, answer_explanation
//         FROM questions 
//         WHERE LOWER(subject) = ANY($1)
//           AND NOT (id = ANY($2::int[]))
//         ORDER BY random()
//         LIMIT $3
//         `,
//         [subjectNames, answeredIds, qpd]
//       );
//     } else {
//       // 🎯 Default: all questions, exclude answered
//       qRes = await pool.query(
//         `
//         SELECT id, subject, topic_id, question_text, options, question_url, 
//                answer_file_url, answer_explanation
//         FROM questions 
//         WHERE NOT (id = ANY($1::int[]))
//         ORDER BY random()
//         LIMIT $2
//         `,
//         [answeredIds, qpd]
//       );
//     }

//     const questions = qRes.rows;

//     // ✅ Insert quiz session
//     const sessionRes = await pool.query(
//       `
//       INSERT INTO user_quiz_sessions 
//       (user_id, started_at, allowed_duration_seconds, total_questions, type)
//       VALUES ($1, now(), 300, $2, 'daily')
//       RETURNING *
//       `,
//       [userId, questions.length]
//     );

//     const session = sessionRes.rows[0];

//     return res.json({ ok: true, session, questions });
//   } catch (err) {
//     console.error("startQuiz error:", err);
//     return res.status(500).json({ ok: false, message: "Server error" });
//   }
// };

export const startQuiz = async (req, res) => {
  try {
    const userId = req.userId;
    const { subjects, topics } = req.body;

    // ✅ 1️⃣ Get user's daily question limit
    const userRes = await pool.query(
      "SELECT questions_per_day FROM users WHERE id=$1",
      [userId]
    );
    const qpd = userRes.rows[0]?.questions_per_day || 10;

    // ✅ 2️⃣ Get already answered normal question_ids
    const answeredRes = await pool.query(
      "SELECT question_id FROM user_answered_questions WHERE user_id=$1",
      [userId]
    );
    const answeredIds = answeredRes.rows.map((r) => r.question_id);

    // ==========================================================
    // 🎯 3️⃣ Fetch Normal Questions
    // ==========================================================
    let normalQuery = `
      SELECT 
        id,
        subject,
        topic_id,
        question_text,
        options,
        question_url,
        answer_file_url,
        answer_explanation
      FROM questions
      WHERE NOT (id = ANY($1::int[]))
    `;
    const queryParams = [answeredIds];

    if (topics?.length) {
      normalQuery += ` AND topic_id = ANY($2::int[])`;
      queryParams.push(topics);
    } else if (subjects?.length) {
      const subjectNamesRes = await pool.query(
        "SELECT subject FROM subjects WHERE id = ANY($1)",
        [subjects]
      );
      const subjectNames = subjectNamesRes.rows.map((r) =>
        r.subject.toLowerCase()
      );
      normalQuery += ` AND LOWER(subject) = ANY($${queryParams.length + 1})`;
      queryParams.push(subjectNames);
    }

    normalQuery += ` ORDER BY random() LIMIT $${queryParams.length + 1}`;
    queryParams.push(Math.ceil(qpd / 2)); // half from normal

    const normalRes = await pool.query(normalQuery, queryParams);

    // ==========================================================
    // 🎯 4️⃣ Fetch Editable Quizzes
    // ==========================================================

    const desiredEditableCount = Math.floor(qpd / 2);

const editableQuizRes = await pool.query(
  `
  WITH answered AS (
    SELECT question_id
    FROM editing_quiz_answers
    WHERE user_id = $1
    GROUP BY question_id
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
  WHERE a.question_id IS NULL                         -- keep only unanswered targets
  GROUP BY eq.id
  HAVING COUNT(eqq.id) > 0                            -- drop passages with no remaining targets
  ORDER BY random()
  LIMIT $2
  `,
  [userId, desiredEditableCount]
);

    // ==========================================================
    // 🎯 5️⃣ Combine & Format Data
    // ==========================================================
    const normalQuestions = normalRes.rows.map((q) => ({
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

    const editableQuizzes = editableQuizRes.rows.map((quiz) => ({
      id: quiz.quiz_id,
      title: quiz.title,
      passage: quiz.passage,
      grade_id: quiz.grade_id,
      subject_id: quiz.subject_id,
      topic_id: quiz.topic_id,
      questions: quiz.questions,
      type: "editable",
    }));

    // ✅ Merge and Shuffle both types
    const combinedQuestions = [...editableQuizzes, ...normalQuestions].sort(
      () => Math.random() - 0.5
    );

    // ==========================================================
    // 🎯 6️⃣ Insert Quiz Session
    // ==========================================================
    const sessionRes = await pool.query(
      `
      INSERT INTO user_quiz_sessions 
      (user_id, started_at, allowed_duration_seconds, total_questions, type)
      VALUES ($1, now(), 300, $2, 'mixed')
      RETURNING *
      `,
      [userId, combinedQuestions.length]
    );

    const session = sessionRes.rows[0];

    // ==========================================================
    // ✅ 7️⃣ Final Response (Frontend-Compatible)
    // ==========================================================
    return res.status(200).json({
      ok: true,
      session,
      questions: combinedQuestions,
    });
  } catch (err) {
    console.error("startQuiz error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
};




// submit answers for a session (array of {question_id, selected_option_id})

// export const submitAnswers = async (req, res) => {
//   try {
//     const userId = req.userId;
//     const { session_id, answers } = req.body;

//     if (!session_id || !Array.isArray(answers)) {
//       return res.status(400).json({ ok: false, message: 'Invalid payload' });
//     }

//     const sessionRes = await pool.query(
//       'SELECT * FROM user_quiz_sessions WHERE id=$1 AND user_id=$2',
//       [session_id, userId]
//     );
//     const session = sessionRes.rows[0];
//     if (!session) {
//       return res.status(404).json({ ok: false, message: 'Session not found' });
//     }

//     let correctCount = 0;
//     for (const ans of answers) {
//       const qRes = await pool.query(
//         'SELECT correct_option_id FROM questions WHERE id=$1',
//         [ans.question_id]
//       );
//       if (!qRes.rowCount) continue;

//       const correct = qRes.rows[0].correct_option_id;
//       const is_correct = (correct === ans.selected_option_id);
//       if (is_correct) correctCount++;

//       await pool.query(
//         `INSERT INTO user_answers (session_id, question_id, selected_option_id, is_correct, answered_at)
//          VALUES ($1, $2, $3, $4, now())
//          ON CONFLICT (session_id, question_id)
//          DO UPDATE SET 
//             selected_option_id = EXCLUDED.selected_option_id,
//             is_correct = EXCLUDED.is_correct,
//             answered_at = now()`,
//         [session_id, ans.question_id, ans.selected_option_id, is_correct]
//       );

//       await pool.query(
//         `INSERT INTO user_answered_questions (user_id, question_id, answered_at)
//          VALUES ($1, $2, now())
//          ON CONFLICT (user_id, question_id) DO NOTHING`,
//         [userId, ans.question_id]
//       );
//     }

//     const quizsessionData = await pool.query(
//       `UPDATE user_quiz_sessions 
//        SET finished_at = now(), score = $1 
//        WHERE id = $2 RETURNING *`,
//       [correctCount, session_id]
//     );

//     const incorrectCount = answers.length - correctCount;
//     await pool.query(
//       `INSERT INTO user_activity (user_id, activity_date, correct_count, incorrect_count)
//        VALUES ($1, current_date, $2, $3)
//        ON CONFLICT (user_id, activity_date)
//        DO UPDATE SET 
//           correct_count = user_activity.correct_count + $2, 
//           incorrect_count = user_activity.incorrect_count + $3`,
//       [userId, correctCount, incorrectCount]
//     );

//     // Send notification using the updated function
//     const message = `🎯 Quiz completed! You scored ${correctCount}/${answers.length}. ${correctCount >= answers.length * 0.8 ? 'Excellent work! 🌟' : 'Keep practicing! 💪'}`;

//     res.json({ 
//       ok: true, 
//       score: correctCount, 
//       total: answers.length, 
//       data: quizsessionData.rows[0] 
//     });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ ok: false, message: 'Server error' });
//   }
// };

// working submit answers

// export const submitAnswers = async (req, res) => {
//   try {
//     const userId = req.userId;
//     const { session_id, answers } = req.body;

//     if (!session_id || !Array.isArray(answers)) {
//       return res.status(400).json({ ok: false, message: 'Invalid payload' });
//     }

//     const sessionRes = await pool.query(
//       'SELECT * FROM user_quiz_sessions WHERE id=$1 AND user_id=$2',
//       [session_id, userId]
//     );
//     const session = sessionRes.rows[0];
//     console.log("session", session)
//     if (!session) {
//       return res.status(404).json({ ok: false, message: 'Session not found' });
//     }

//     let correctCount = 0;
//     for (const ans of answers) {
//       const qRes = await pool.query(
//         'SELECT correct_option_id FROM questions WHERE id=$1',
//         [ans.question_id]
//       );
//       if (!qRes.rowCount) continue;

//       const correct = qRes.rows[0].correct_option_id;
//       const is_correct = (correct === ans.selected_option_id);
//       if (is_correct) correctCount++;

//       await pool.query(
//         `INSERT INTO user_answers (session_id, question_id, selected_option_id, is_correct, answered_at)
//          VALUES ($1, $2, $3, $4, now())
//          ON CONFLICT (session_id, question_id)
//          DO UPDATE SET 
//             selected_option_id = EXCLUDED.selected_option_id,
//             is_correct = EXCLUDED.is_correct,
//             answered_at = now()`,
//         [session_id, ans.question_id, ans.selected_option_id, is_correct]
//       );

//       await pool.query(
//         `INSERT INTO user_answered_questions (user_id, question_id, answered_at)
//          VALUES ($1, $2, now())
//          ON CONFLICT (user_id, question_id) DO NOTHING`,
//         [userId, ans.question_id]
//       );
//     }

//     const quizsessionData = await pool.query(
//       `UPDATE user_quiz_sessions 
//        SET finished_at = now(), score = $1 
//        WHERE id = $2 RETURNING *`,
//       [correctCount, session_id]
//     );

//     const incorrectCount = answers.length - correctCount;
//     console.log("incorrectCount", incorrectCount)
//     console.log("answers.length ", answers.length)
//     console.log("correctCount", correctCount)

//     await pool.query(
//       `INSERT INTO user_activity (user_id, activity_date, correct_count, incorrect_count)
//        VALUES ($1, current_date, $2, $3)
//        ON CONFLICT (user_id, activity_date)
//        DO UPDATE SET 
//           correct_count = user_activity.correct_count + $2, 
//           incorrect_count = user_activity.incorrect_count + $3`,
//       [userId, correctCount, incorrectCount]
//     );

//     // 🎯 Generate quiz completion notifications
//     await NotificationService.generateQuizCompletionNotifications(userId, session_id);

//     const percentage = Math.round((correctCount / answers.length) * 100);
//     const message = `🎯 Quiz completed! You scored ${correctCount}/${answers.length} (${percentage}%). ${percentage >= 80 ? 'Excellent work! 🌟' :
//       percentage >= 60 ? 'Good job! Keep practicing! 💪' :
//         'Keep studying and try again! 📚'
//       }`;

//     res.json({
//       ok: true,
//       score: correctCount,
//       total: answers.length,
//       percentage: percentage,
//       data: quizsessionData.rows[0],
//       message: message
//     });   
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ ok: false, message: 'Server error' });
//   }
// };

export const submitAnswers = async (req, res) => {
  try {
    const userId = req.userId;
    const { session_id, answers } = req.body; // answers: [{question_id, selected_option_id OR user_answer, type}]

    if (!session_id || !Array.isArray(answers)) {
      return res.status(400).json({ ok: false, message: "Invalid payload" });
    }

    // 🔹 Validate session
    const sessionRes = await pool.query(
      "SELECT * FROM user_quiz_sessions WHERE id=$1 AND user_id=$2",
      [session_id, userId]
    );
    const session = sessionRes.rows[0];
    if (!session) {
      return res
        .status(404)
        .json({ ok: false, message: "Session not found" });
    }

    let correctCount = 0;
    let totalCount = answers.length;

    console.log("answers", answers)
    // 🔹 Loop through each answer
    for (const ans of answers) {
      if (ans.type === "normal") {
        // 🎯 Normal question type
        const qRes = await pool.query(
          "SELECT correct_option_id FROM questions WHERE id=$1",
          [ans.question_id]
        );
        if (!qRes.rowCount) continue;

        const correct = qRes.rows[0].correct_option_id;
        const is_correct = correct === ans.selected_option_id;
        if (is_correct) correctCount++;

        await pool.query(
          `INSERT INTO user_answers (session_id, question_id, selected_option_id, is_correct, answered_at)
           VALUES ($1, $2, $3, $4, now())
           ON CONFLICT (session_id, question_id)
           DO UPDATE SET 
              selected_option_id = EXCLUDED.selected_option_id,
              is_correct = EXCLUDED.is_correct,
              answered_at = now()`,
          [session_id, ans.question_id, ans.selected_option_id, is_correct]
        );

        await pool.query(
          `INSERT INTO user_answered_questions (user_id, question_id, answered_at)
           VALUES ($1, $2, now())
           ON CONFLICT (user_id, question_id) DO NOTHING`,
          [userId, ans.question_id]
        );
      }

      if (ans.type === "editable") {
        // 📝 Editable quiz type (Grammar correction)
        const qRes = await pool.query(
          "SELECT correct_word FROM editing_quiz_questions WHERE id=$1",
          [ans.question_id]
        );
        if (!qRes.rowCount) continue;

        const correctWord = qRes.rows[0].correct_word.trim().toLowerCase();
        const userAnswer = ans.provided_word.trim().toLowerCase();
        console.log("correctWord", correctWord, "userAnswer", userAnswer)
        const is_correct = correctWord === userAnswer;

        console.log("correctWord", correctWord, "userAnswer", userAnswer, "is_correct", is_correct)

        if (is_correct) correctCount++;

        await pool.query(
          `INSERT INTO editing_quiz_answers 
   (user_id, quiz_id, question_id, user_answer, is_correct, session_id, created_at)
   VALUES ($1, $2, $3, $4, $5, $6, NOW())
   ON CONFLICT (user_id, quiz_id, question_id)
   DO UPDATE SET 
      user_answer = EXCLUDED.user_answer,
      is_correct = EXCLUDED.is_correct,
      created_at = NOW()`,
          [
            userId,
            ans.quiz_id,
            ans.question_id,
            ans.provided_word,
            is_correct,
            session_id
          ]
        );


      }
    }

    // 🔹 Update quiz session
    const quizsessionData = await pool.query(
      `UPDATE user_quiz_sessions 
       SET finished_at = now(), score = $1 
       WHERE id = $2 RETURNING *`,
      [correctCount, session_id]
    );

    const incorrectCount = totalCount - correctCount;

    // 🔹 Log activity
    await pool.query(
      `INSERT INTO user_activity (user_id, activity_date, correct_count, incorrect_count)
       VALUES ($1, current_date, $2, $3)
       ON CONFLICT (user_id, activity_date)
       DO UPDATE SET 
          correct_count = user_activity.correct_count + $2, 
          incorrect_count = user_activity.incorrect_count + $3`,
      [userId, correctCount, incorrectCount]
    );

    // 🔔 Notification
    await NotificationService.generateQuizCompletionNotifications(
      userId,
      session_id
    );

    const percentage = Math.round((correctCount / totalCount) * 100);
    const message = `🎯 Quiz completed! You scored ${correctCount}/${totalCount} (${percentage}%). ${percentage >= 80
      ? "Excellent work! 🌟"
      : percentage >= 60
        ? "Good job! Keep practicing! 💪"
        : "Keep studying and try again! 📚"
      }`;

    res.json({
      ok: true,
      score: correctCount,
      total: totalCount,
      percentage,
      data: quizsessionData.rows[0],
      message,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};


// quiz review: return questions + user answers for a session


// export const reviewSession = async (req, res) => {
//   try {
//     const { sessionId } = req.params;
//     const userId = req.userId;
//     const sRes = await pool.query('SELECT * FROM user_quiz_sessions WHERE id=$1 AND user_id=$2', [sessionId, userId]);
//     if (!sRes.rowCount) return res.status(404).json({ ok: false, message: 'Session not found' });

//     const qRes = await pool.query(
//       `SELECT a.*, q.question_text, q.options, q.correct_option_id, q.question_url, q.answer_file_url, q.answer_explanation
//        FROM user_answers a
//        JOIN questions q ON q.id = a.question_id
//        WHERE a.session_id = $1`, [sessionId]
//     );

//     res.json({ ok: true, answers: qRes.rows });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ ok: false, message: 'Server error' });
//   }
// };

export const reviewSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.userId;

    // ✅ Validate session
    const sRes = await pool.query(
      'SELECT * FROM user_quiz_sessions WHERE id=$1 AND user_id=$2',
      [sessionId, userId]
    );
    if (!sRes.rowCount)
      return res
        .status(404)
        .json({ ok: false, message: 'Session not found' });

    const session = sRes.rows[0];

    // ✅ 1️⃣ Fetch normal quiz answers
    const normalRes = await pool.query(
      `SELECT 
        a.*, 
        q.question_text, 
        q.options, 
        q.correct_option_id, 
        q.question_url, 
        q.answer_file_url, 
        q.answer_explanation
       FROM user_answers a
       JOIN questions q ON q.id = a.question_id
       WHERE a.session_id = $1`,
      [sessionId]
    );

    // ✅ 2️⃣ Fetch editable quiz answers
    const editableRes = await pool.query(
      `SELECT 
    ea.id AS answer_id,
    ea.quiz_id,
    ea.question_id,
    ea.user_answer,
    ea.is_correct,
    eq.incorrect_word,
    eq.correct_word,
    eq.position,
    eq.quiz_id AS eq_quiz_id,
    eq.id AS eq_id,
    eq.correct_word AS correct_answer,
    eq.incorrect_word AS question_text,
    e.title AS quiz_title,
    e.passage AS passage_text
   FROM editing_quiz_answers ea
   JOIN editing_quiz_questions eq ON eq.id = ea.question_id
   JOIN editing_quiz e ON e.id = ea.quiz_id
   WHERE ea.user_id = $1 AND ea.session_id = $2`, // ✅ use session_id here
      [userId, sessionId]
    );



    // ✅ Combine both
    const combinedAnswers = [
      ...normalRes.rows.map((r) => ({ type: 'normal', ...r })),
      ...editableRes.rows.map((r) => ({ type: 'editable', ...r })),
    ];

    res.json({
      ok: true,
      session,
      totalAnswers: combinedAnswers.length,
      answers: combinedAnswers,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: 'Server error' });
  }
};


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

// working code....... 

// export const startMiniQuiz = async (req, res) => {
//   try {
//     const userId = req.userId;
//     const { subjects, topics } = req.body; // subjects = [id...], topics = [id...]

//     // ✅ Already answered question_ids
//     const answeredRes = await pool.query(
//       "SELECT question_id FROM user_answered_questions WHERE user_id=$1",
//       [userId]
//     );
//     const answeredIds = answeredRes.rows.map((r) => r.question_id);

//     let qRes;

//     if (topics && topics.length > 0) {
//       qRes = await pool.query(
//         `
//         SELECT id, subject, topic_id, question_text, options, question_url, 
//                answer_file_url, answer_explanation
//         FROM questions 
//         WHERE topic_id = ANY($1::int[])
//           AND NOT (id = ANY($2::int[]))
//         ORDER BY random()
//         LIMIT 5
//         `,
//         [topics, answeredIds]
//       );
//     } else if (subjects && subjects.length > 0) {
//       const subjectNameRes = await pool.query(
//         "SELECT subject FROM subjects WHERE id = ANY($1)",
//         [subjects]
//       );
//       const subjectNames = subjectNameRes.rows.map((row) =>
//         row.subject.toLowerCase()
//       );

//       qRes = await pool.query(
//         `
//         SELECT id, subject, topic_id, question_text, options, question_url, 
//                answer_file_url, answer_explanation
//         FROM questions 
//         WHERE LOWER(subject) = ANY($1)
//           AND NOT (id = ANY($2::int[]))
//         ORDER BY random()
//         LIMIT 5
//         `,
//         [subjectNames, answeredIds]
//       );
//     } else {
//       qRes = await pool.query(
//         `
//         SELECT id, subject, topic_id, question_text, options, question_url, 
//                answer_file_url, answer_explanation
//         FROM questions 
//         WHERE NOT (id = ANY($1::int[]))
//         ORDER BY random()
//         LIMIT 5
//         `,
//         [answeredIds]
//       );
//     }

//     const questions = qRes.rows;

//     const sessionRes = await pool.query(
//       `
//       INSERT INTO user_quiz_sessions 
//       (user_id, started_at, allowed_duration_seconds, total_questions, type)
//       VALUES ($1, now(), 150, $2, 'mini')
//       RETURNING *
//       `,
//       [userId, questions.length]
//     );

//     return res.json({ ok: true, session: sessionRes.rows[0], questions });
//   } catch (err) {
//     console.error("startMiniQuiz error:", err);
//     return res.status(500).json({ ok: false, message: "Server error" });
//   }
// };

export const startMiniQuiz = async (req, res) => {
  try {
    const userId = req.userId;
    const { subjects, topics } = req.body; // subjects = [id], topics = [id]

    // ===== 1) Already-answered normal question_ids
    const answeredRes = await pool.query(
      `SELECT question_id FROM user_answered_questions WHERE user_id = $1`,
      [userId]
    );
    const answeredIds = answeredRes.rows.map(r => r.question_id);

    // Helpers
    const MINI_TOTAL = 5;
    const desiredEditable = 2; // default target split
    const desiredNormal   = MINI_TOTAL - desiredEditable;

    // ===== 2) Fetch EDITABLE passages (unanswered targets only)
    // Build dynamic SQL for editable with filters and (optionally) exclusions
    const getEditable = async ({ limit, excludeQuizIds = [] }) => {
      const editableParams = [userId]; // $1
      let idx = editableParams.length;

      let where = `a.question_id IS NULL`; // only unanswered targets

      if (topics?.length) {
        editableParams.push(topics); // $2
        idx++;
        where += ` AND eq.topic_id = ANY($${idx})`;
      } else if (subjects?.length) {
        editableParams.push(subjects); // $2
        idx++;
        where += ` AND eq.subject_id = ANY($${idx})`;
      }

      if (excludeQuizIds.length) {
        editableParams.push(excludeQuizIds); // next
        idx++;
        where += ` AND NOT (eq.id = ANY($${idx}::int[]))`;
      }

      editableParams.push(limit); // last param = LIMIT
      const limitParam = `$${editableParams.length}`;

      const sql = `
        WITH answered AS (
          SELECT question_id
          FROM editing_quiz_answers
          WHERE user_id = $1
          GROUP BY question_id
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
        WHERE ${where}
        GROUP BY eq.id
        HAVING COUNT(eqq.id) > 0
        ORDER BY random()
        LIMIT ${limitParam};
      `;
      const { rows } = await pool.query(sql, editableParams);
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

    // ===== 3) Fetch NORMAL questions with filters/exclusions
    const getNormal = async (limit, extraExcludedIds = []) => {
      let sql = `
        SELECT id, subject, topic_id, question_text, options, question_url,
               answer_file_url, answer_explanation
        FROM questions
        WHERE NOT (id = ANY($1::int[]))
      `;
      const params = [answeredIds];

      if (topics?.length) {
        sql += ` AND topic_id = ANY($2::int[])`;
        params.push(topics);
      } else if (subjects?.length) {
        // subjects are IDs; map to subject names like your original, or filter by name if your schema requires.
        // If your 'questions.subject' is a text name, resolve names first (like your code does):
        const subjectNameRes = await pool.query(
          `SELECT subject FROM subjects WHERE id = ANY($1::int[])`,
          [subjects]
        );
        const subjectNames = subjectNameRes.rows.map(r => r.subject.toLowerCase());
        sql += ` AND LOWER(subject) = ANY($${params.length + 1})`;
        params.push(subjectNames);
      }

      if (extraExcludedIds.length) {
        sql += ` AND NOT (id = ANY($${params.length + 1}::int[]))`;
        params.push(extraExcludedIds);
      }

      sql += ` ORDER BY random() LIMIT $${params.length + 1}`;
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

    // ---- First pass: target 2 editable, then fill remaining with normal
    const editable1 = await getEditable({ limit: desiredEditable });
    const normalNeeded = Math.max(MINI_TOTAL - editable1.length, 0);
    const normal1 = await getNormal(normalNeeded);

    let combined = [...editable1, ...normal1];

    // ---- If still short, try topping up from whichever type can still supply
    if (combined.length < MINI_TOTAL) {
      const remaining = MINI_TOTAL - combined.length;

      // Prefer topping up with NORMAL first
      const alreadyNormalIds = normal1.map(n => n.id);
      const normalTopUp = await getNormal(remaining, alreadyNormalIds);
      combined = [...combined, ...normalTopUp];

      // If still short, try more EDITABLE (exclude already picked quiz_ids)
      if (combined.length < MINI_TOTAL) {
        const remaining2 = MINI_TOTAL - combined.length;
        const excludeQuizIds = editable1.map(e => e.id);
        const editableTopUp = await getEditable({ limit: remaining2, excludeQuizIds });
        combined = [...combined, ...editableTopUp];
      }
    }

    // Shuffle
    combined.sort(() => Math.random() - 0.5);

    // ===== 4) Create mini session
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
    return res.status(500).json({ ok: false, message: "Server error" });
  }
};


// revision quiz..........

// working revision quiz code.......

// export const startRevisionQuiz = async (req, res) => {
//   try {
//     const userId = req.userId;
//     const { subjects, topics } = req.body;

//     // ✅ Already answered question_ids
//     const answeredRes = await pool.query(
//       "SELECT question_id FROM user_answered_questions WHERE user_id=$1",
//       [userId]
//     );
//     const answeredIds = answeredRes.rows.map((r) => r.question_id);

//     if (answeredIds.length === 0) {
//       return res.json({ ok: true, session: null, questions: [] });
//     }

//     let qRes;

//     if (topics && topics.length > 0) {
//       qRes = await pool.query(
//         `
//         SELECT id, subject, topic_id, question_text, options, question_url, 
//                answer_file_url, answer_explanation
//         FROM questions 
//         WHERE topic_id = ANY($1::int[])
//           AND id = ANY($2::int[])
//         ORDER BY random()
//         LIMIT 30
//         `,
//         [topics, answeredIds]
//       );
//     } else if (subjects && subjects.length > 0) {
//       const subjectNameRes = await pool.query(
//         "SELECT subject FROM subjects WHERE id = ANY($1)",
//         [subjects]
//       );
//       const subjectNames = subjectNameRes.rows.map((row) =>
//         row.subject.toLowerCase()
//       );

//       qRes = await pool.query(
//         `
//         SELECT id, subject, topic_id, question_text, options, question_url, 
//                answer_file_url, answer_explanation
//         FROM questions 
//         WHERE LOWER(subject) = ANY($1)
//           AND id = ANY($2::int[])
//         ORDER BY random()
//         LIMIT 30
//         `,
//         [subjectNames, answeredIds]
//       );
//     } else {
//       qRes = await pool.query(
//         `
//         SELECT id, subject, topic_id, question_text, options, question_url, 
//                answer_file_url, answer_explanation
//         FROM questions 
//         WHERE id = ANY($1::int[])
//         ORDER BY random()
//         LIMIT 30
//         `,
//         [answeredIds]
//       );
//     }

//     const questions = qRes.rows;

//     const sessionRes = await pool.query(
//       `
//       INSERT INTO user_quiz_sessions 
//       (user_id, started_at, allowed_duration_seconds, total_questions, type)
//       VALUES ($1, now(), 300, $2, 'revision')
//       RETURNING *
//       `,
//       [userId, questions.length]
//     );

//     return res.json({ ok: true, session: sessionRes.rows[0], questions });
//   } catch (err) {
//     console.error("startRevisionQuiz error:", err);
//     return res.status(500).json({ ok: false, message: "Server error" });
//   }
// };


export const startRevisionQuiz = async (req, res) => {
  try {
    const userId = req.userId;
    const { subjects, topics } = req.body;

    // ===== 1) Previously answered: normal + editable-targets
    const answeredNormalRes = await pool.query(
      `SELECT question_id FROM user_answered_questions WHERE user_id=$1`,
      [userId]
    );
    const answeredNormalIds = answeredNormalRes.rows.map(r => r.question_id);

    const answeredEditableRes = await pool.query(
      `SELECT question_id FROM editing_quiz_answers WHERE user_id=$1`,
      [userId]
    );
    const answeredEditableTargetIds = answeredEditableRes.rows.map(r => r.question_id);

    // If user has nothing to revise at all
    if (answeredNormalIds.length === 0 && answeredEditableTargetIds.length === 0) {
      return res.json({ ok: true, session: null, questions: [] });
    }

    const TOTAL = 30;
    const desiredEditable = 15;
    const desiredNormal   = TOTAL - desiredEditable;

    // ===== helpers

    // -- A) Fetch EDITABLE passages that include ONLY the targets the user answered before
    const getEditableAnswered = async ({ limit, excludeQuizIds = [] }) => {
      const params = [userId]; // $1 (for editing_quiz_answers.user_id)
      let idx = params.length;

      // base WHERE: only targets user has answered
      let where = `a.question_id IS NOT NULL`;

      if (topics?.length) {
        params.push(topics); // next
        idx++;
        where += ` AND eq.topic_id = ANY($${idx}::int[])`;
      } else if (subjects?.length) {
        params.push(subjects); // next
        idx++;
        where += ` AND eq.subject_id = ANY($${idx}::int[])`;
      }

      if (answeredEditableTargetIds.length > 0) {
        params.push(answeredEditableTargetIds); // next
        idx++;
        where += ` AND eqq.id = ANY($${idx}::int[])`;
      } else {
        // No answered editable -> return []
        return [];
      }

      if (excludeQuizIds.length) {
        params.push(excludeQuizIds);
        idx++;
        where += ` AND NOT (eq.id = ANY($${idx}::int[]))`;
      }

      params.push(limit);
      const limitParam = `$${params.length}`;

      const sql = `
        WITH user_answers AS (
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
              'correct_word',  eqq.correct_word,
              'position',      eqq.position
            )
            ORDER BY eqq.position
          ) AS questions
        FROM editing_quiz eq
        JOIN editing_quiz_questions eqq ON eqq.quiz_id = eq.id
        JOIN user_answers a ON a.question_id = eqq.id   -- keep only answered targets
        WHERE ${where}
        GROUP BY eq.id
        HAVING COUNT(eqq.id) > 0
        ORDER BY random()
        LIMIT ${limitParam};
      `;
      const { rows } = await pool.query(sql, params);
      return rows.map(quiz => ({
        id: quiz.quiz_id,
        title: quiz.title,
        passage: quiz.passage,
        grade_id: quiz.grade_id,
        subject_id: quiz.subject_id,
        topic_id: quiz.topic_id,
        questions: quiz.questions, // only answered targets
        type: "editable",
      }));
    };

    // -- B) Fetch NORMAL questions that were previously answered by the user
    const getNormalAnswered = async (limit, extraExcludedIds = []) => {
      let sql = `
        SELECT id, subject, topic_id, question_text, options, question_url, 
               answer_file_url, answer_explanation
        FROM questions
        WHERE id = ANY($1::int[])
      `;
      const params = [answeredNormalIds];

      if (topics?.length) {
        sql += ` AND topic_id = ANY($2::int[])`;
        params.push(topics);
      } else if (subjects?.length) {
        // Map subject IDs -> subject names (assuming questions.subject is text)
        const subjectNameRes = await pool.query(
          `SELECT subject FROM subjects WHERE id = ANY($1::int[])`,
          [subjects]
        );
        const subjectNames = subjectNameRes.rows.map(r => r.subject.toLowerCase());
        sql += ` AND LOWER(subject) = ANY($${params.length + 1})`;
        params.push(subjectNames);
      }

      if (extraExcludedIds.length) {
        sql += ` AND NOT (id = ANY($${params.length + 1}::int[]))`;
        params.push(extraExcludedIds);
      }

      sql += ` ORDER BY random() LIMIT $${params.length + 1}`;
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

    // ===== 2) First pass: aim for 15 editable + 15 normal
    const editable1 = await getEditableAnswered({ limit: desiredEditable });
    const normal1   = await getNormalAnswered(desiredNormal);

    let combined = [...editable1, ...normal1];

    // ===== 3) Top-up if short, preferring the other type first
    if (combined.length < TOTAL) {
      const remaining = TOTAL - combined.length;

      // try more NORMAL first
      const normalExtra = await getNormalAnswered(remaining, normal1.map(n => n.id));
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

    // Shuffle for variety
    combined.sort(() => Math.random() - 0.5);

    // ===== 4) Create revision session
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
    return res.status(500).json({ ok: false, message: "Server error" });
  }
};
