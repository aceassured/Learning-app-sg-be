import pool from "../../database.js";
import { io } from "../../index.js";
import { NotificationService } from "../services/notificationService.js";
import { sendNotification } from "../utils/sendNotification.js";

// helper: get today's quiz status

export const getHomeData = async (req, res) => {
  const userId = req.userId;
  try {
    const todayRes = await pool.query(
      `SELECT s.*, COUNT(a.*) AS answered_count
       FROM user_quiz_sessions s
       LEFT JOIN user_answers a ON a.session_id = s.id
       WHERE s.user_id = $1 AND s.started_at::date = current_date
       GROUP BY s.id
       ORDER BY s.started_at DESC
       LIMIT 1`, [userId]
    );
    const todaySession = todayRes.rows[0] || null;

    const weekDatesRes = await pool.query(
      `SELECT activity_date, correct_count, incorrect_count 
       FROM user_activity
       WHERE user_id = $1 
         AND activity_date >= date_trunc('week', current_date)
       ORDER BY activity_date`,
      [userId]
    );

    // build week map
    const weekMap = {};
    weekDatesRes.rows.forEach(r => {
      weekMap[r.activity_date.toISOString().slice(0, 10)] = r;
    });

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
    const all7 = Object.keys(weekMap).length === 7 && Object.values(weekMap).every(e => e.correct_count + e.incorrect_count > 0);

    const monthRes = await pool.query(
      `SELECT SUM(correct_count) as correct, SUM(incorrect_count) as incorrect
       FROM user_activity 
       WHERE user_id = $1 
         AND date_trunc('month', activity_date) = date_trunc('month', current_date)`,
      [userId]
    );

    const month = monthRes.rows[0] || { correct: 0, incorrect: 0 };
    const completedThisMonth = +(month.correct || 0) + +(month.incorrect || 0);

    // ----------------------------
    // 🔥 Calculate Full Streak Count
    // ----------------------------
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
          // move to previous day
          currentDate.setDate(currentDate.getDate() - 1);
        } else if (activityDate.getTime() === currentDate.getTime() - 24 * 60 * 60 * 1000) {
          // also works if exactly yesterday
          streakCount++;
          currentDate.setDate(currentDate.getDate() - 1);
        } else {
          // gap → break streak
          break;
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
      streakCount // 👈 added streak count
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


export const startQuiz = async (req, res) => {
  try {
    const userId = req.userId;
    const { subjects, topics } = req.body; // subjects = [id...], topics = [id...]

    // ✅ Get user's questions_per_day
    const userRes = await pool.query(
      "SELECT questions_per_day FROM users WHERE id=$1",
      [userId]
    );
    const qpd = userRes.rows[0]?.questions_per_day || 10;

    console.log("question per day", qpd)
    // ✅ Already answered question_ids
    const answeredRes = await pool.query(
      "SELECT question_id FROM user_answered_questions WHERE user_id=$1",
      [userId]
    );
    const answeredIds = answeredRes.rows.map((r) => r.question_id);

    let qRes;

    if (topics && topics.length > 0) {
      // 🎯 Pick by topics, exclude answered
      qRes = await pool.query(
        `
        SELECT id, subject, topic_id, question_text, options, question_url, 
               answer_file_url, answer_explanation
        FROM questions 
        WHERE topic_id = ANY($1::int[])
          AND NOT (id = ANY($2::int[]))
        ORDER BY random()
        LIMIT $3
        `,
        [topics, answeredIds, qpd]
      );
    } else if (subjects && subjects.length > 0) {
      // 🎯 Pick by subjects, exclude answered
      const subjectNameRes = await pool.query(
        "SELECT subject FROM subjects WHERE id = ANY($1)",
        [subjects]
      );
      const subjectNames = subjectNameRes.rows.map((row) =>
        row.subject.toLowerCase()
      );

      qRes = await pool.query(
        `
        SELECT id, subject, topic_id, question_text, options, question_url, 
               answer_file_url, answer_explanation
        FROM questions 
        WHERE LOWER(subject) = ANY($1)
          AND NOT (id = ANY($2::int[]))
        ORDER BY random()
        LIMIT $3
        `,
        [subjectNames, answeredIds, qpd]
      );
    } else {
      // 🎯 Default: all questions, exclude answered
      qRes = await pool.query(
        `
        SELECT id, subject, topic_id, question_text, options, question_url, 
               answer_file_url, answer_explanation
        FROM questions 
        WHERE NOT (id = ANY($1::int[]))
        ORDER BY random()
        LIMIT $2
        `,
        [answeredIds, qpd]
      );
    }

    const questions = qRes.rows;

    // ✅ Insert quiz session
    const sessionRes = await pool.query(
      `
      INSERT INTO user_quiz_sessions 
      (user_id, started_at, allowed_duration_seconds, total_questions, type)
      VALUES ($1, now(), 300, $2, 'daily')
      RETURNING *
      `,
      [userId, questions.length]
    );

    const session = sessionRes.rows[0];

    return res.json({ ok: true, session, questions });
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


export const submitAnswers = async (req, res) => {
  try {
    const userId = req.userId;
    const { session_id, answers } = req.body;

    if (!session_id || !Array.isArray(answers)) {
      return res.status(400).json({ ok: false, message: 'Invalid payload' });
    }

    const sessionRes = await pool.query(
      'SELECT * FROM user_quiz_sessions WHERE id=$1 AND user_id=$2',
      [session_id, userId]
    );
    const session = sessionRes.rows[0];
    if (!session) {
      return res.status(404).json({ ok: false, message: 'Session not found' });
    }

    let correctCount = 0;
    for (const ans of answers) {
      const qRes = await pool.query(
        'SELECT correct_option_id FROM questions WHERE id=$1',
        [ans.question_id]
      );
      if (!qRes.rowCount) continue;

      const correct = qRes.rows[0].correct_option_id;
      const is_correct = (correct === ans.selected_option_id);
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

    const quizsessionData = await pool.query(
      `UPDATE user_quiz_sessions 
       SET finished_at = now(), score = $1 
       WHERE id = $2 RETURNING *`,
      [correctCount, session_id]
    );

    const incorrectCount = answers.length - correctCount;
    await pool.query(
      `INSERT INTO user_activity (user_id, activity_date, correct_count, incorrect_count)
       VALUES ($1, current_date, $2, $3)
       ON CONFLICT (user_id, activity_date)
       DO UPDATE SET 
          correct_count = user_activity.correct_count + $2, 
          incorrect_count = user_activity.incorrect_count + $3`,
      [userId, correctCount, incorrectCount]
    );

    // 🎯 Generate quiz completion notifications
    await NotificationService.generateQuizCompletionNotifications(userId, session_id);

    const percentage = Math.round((correctCount / answers.length) * 100);
    const message = `🎯 Quiz completed! You scored ${correctCount}/${answers.length} (${percentage}%). ${percentage >= 80 ? 'Excellent work! 🌟' :
        percentage >= 60 ? 'Good job! Keep practicing! 💪' :
          'Keep studying and try again! 📚'
      }`;

    res.json({
      ok: true,
      score: correctCount,
      total: answers.length,
      percentage: percentage,
      data: quizsessionData.rows[0],
      message: message
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: 'Server error' });
  }
};



// quiz review: return questions + user answers for a session

export const reviewSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.userId;
    const sRes = await pool.query('SELECT * FROM user_quiz_sessions WHERE id=$1 AND user_id=$2', [sessionId, userId]);
    if (!sRes.rowCount) return res.status(404).json({ ok: false, message: 'Session not found' });

    const qRes = await pool.query(
      `SELECT a.*, q.question_text, q.options, q.correct_option_id, q.question_url, q.answer_file_url, q.answer_explanation
       FROM user_answers a
       JOIN questions q ON q.id = a.question_id
       WHERE a.session_id = $1`, [sessionId]
    );

    res.json({ ok: true, answers: qRes.rows });
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

export const startMiniQuiz = async (req, res) => {
  try {
    const userId = req.userId;
    const { subjects, topics } = req.body; // subjects = [id...], topics = [id...]

    // ✅ Already answered question_ids
    const answeredRes = await pool.query(
      "SELECT question_id FROM user_answered_questions WHERE user_id=$1",
      [userId]
    );
    const answeredIds = answeredRes.rows.map((r) => r.question_id);

    let qRes;

    if (topics && topics.length > 0) {
      qRes = await pool.query(
        `
        SELECT id, subject, topic_id, question_text, options, question_url, 
               answer_file_url, answer_explanation
        FROM questions 
        WHERE topic_id = ANY($1::int[])
          AND NOT (id = ANY($2::int[]))
        ORDER BY random()
        LIMIT 5
        `,
        [topics, answeredIds]
      );
    } else if (subjects && subjects.length > 0) {
      const subjectNameRes = await pool.query(
        "SELECT subject FROM subjects WHERE id = ANY($1)",
        [subjects]
      );
      const subjectNames = subjectNameRes.rows.map((row) =>
        row.subject.toLowerCase()
      );

      qRes = await pool.query(
        `
        SELECT id, subject, topic_id, question_text, options, question_url, 
               answer_file_url, answer_explanation
        FROM questions 
        WHERE LOWER(subject) = ANY($1)
          AND NOT (id = ANY($2::int[]))
        ORDER BY random()
        LIMIT 5
        `,
        [subjectNames, answeredIds]
      );
    } else {
      qRes = await pool.query(
        `
        SELECT id, subject, topic_id, question_text, options, question_url, 
               answer_file_url, answer_explanation
        FROM questions 
        WHERE NOT (id = ANY($1::int[]))
        ORDER BY random()
        LIMIT 5
        `,
        [answeredIds]
      );
    }

    const questions = qRes.rows;

    const sessionRes = await pool.query(
      `
      INSERT INTO user_quiz_sessions 
      (user_id, started_at, allowed_duration_seconds, total_questions, type)
      VALUES ($1, now(), 150, $2, 'mini')
      RETURNING *
      `,
      [userId, questions.length]
    );

    return res.json({ ok: true, session: sessionRes.rows[0], questions });
  } catch (err) {
    console.error("startMiniQuiz error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
};
// revision quiz..........

export const startRevisionQuiz = async (req, res) => {
  try {
    const userId = req.userId;
    const { subjects, topics } = req.body;

    // ✅ Already answered question_ids
    const answeredRes = await pool.query(
      "SELECT question_id FROM user_answered_questions WHERE user_id=$1",
      [userId]
    );
    const answeredIds = answeredRes.rows.map((r) => r.question_id);

    if (answeredIds.length === 0) {
      return res.json({ ok: true, session: null, questions: [] });
    }

    let qRes;

    if (topics && topics.length > 0) {
      qRes = await pool.query(
        `
        SELECT id, subject, topic_id, question_text, options, question_url, 
               answer_file_url, answer_explanation
        FROM questions 
        WHERE topic_id = ANY($1::int[])
          AND id = ANY($2::int[])
        ORDER BY random()
        LIMIT 30
        `,
        [topics, answeredIds]
      );
    } else if (subjects && subjects.length > 0) {
      const subjectNameRes = await pool.query(
        "SELECT subject FROM subjects WHERE id = ANY($1)",
        [subjects]
      );
      const subjectNames = subjectNameRes.rows.map((row) =>
        row.subject.toLowerCase()
      );

      qRes = await pool.query(
        `
        SELECT id, subject, topic_id, question_text, options, question_url, 
               answer_file_url, answer_explanation
        FROM questions 
        WHERE LOWER(subject) = ANY($1)
          AND id = ANY($2::int[])
        ORDER BY random()
        LIMIT 30
        `,
        [subjectNames, answeredIds]
      );
    } else {
      qRes = await pool.query(
        `
        SELECT id, subject, topic_id, question_text, options, question_url, 
               answer_file_url, answer_explanation
        FROM questions 
        WHERE id = ANY($1::int[])
        ORDER BY random()
        LIMIT 30
        `,
        [answeredIds]
      );
    }

    const questions = qRes.rows;

    const sessionRes = await pool.query(
      `
      INSERT INTO user_quiz_sessions 
      (user_id, started_at, allowed_duration_seconds, total_questions, type)
      VALUES ($1, now(), 300, $2, 'revision')
      RETURNING *
      `,
      [userId, questions.length]
    );

    return res.json({ ok: true, session: sessionRes.rows[0], questions });
  } catch (err) {
    console.error("startRevisionQuiz error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
};

