import pool from "../../database.js";

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


    const weekMap = {};
    weekDatesRes.rows.forEach(r => {
      weekMap[r.activity_date.toISOString().slice(0, 10)] = r;
    });

    let streak = 0;
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
       FROM user_activity WHERE user_id = $1 AND date_trunc('month', activity_date) = date_trunc('month', current_date)`, [userId]
    );

    const month = monthRes.rows[0] || { correct: 0, incorrect: 0 };
    const completedThisMonth = +(month.correct || 0) + +(month.incorrect || 0);

    res.json({
      ok: true,
      todaySession,
      week: weekDatesRes.rows,
      all7: all7 ? 7 : 0,
      consecutive,
      monthly: { completed: completedThisMonth, target: 25 }
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

export const startQuiz = async (req, res) => {
  try {
    const userId = req.userId;
    const { subjects } = req.body; // e.g. ["mathematics","science"]

    // Get questions_per_day from users table
    const userRes = await pool.query(
      "SELECT questions_per_day FROM users WHERE id=$1",
      [userId]
    );
    const qpd = userRes.rows[0]?.questions_per_day || 10;

    let qRes;
    if (subjects && subjects.length > 0) {
      // Filter by selected subjects (case-insensitive)
      qRes = await pool.query(
        `
        SELECT id, subject, question_text, options 
        FROM questions 
        WHERE LOWER(subject) = ANY($1) 
        ORDER BY random() 
        LIMIT $2
        `,
        [subjects.map((s) => s.toLowerCase()), qpd]
      );
    } else {
      // Fallback: pick from all subjects
      qRes = await pool.query(
        `
        SELECT id, subject, question_text, options 
        FROM questions 
        ORDER BY random() 
        LIMIT $1
        `,
        [qpd]
      );
    }

    const questions = qRes.rows;

    // Insert into user_quiz_sessions
    const sessionRes = await pool.query(
      `
      INSERT INTO user_quiz_sessions 
      (user_id, started_at, allowed_duration_seconds, total_questions)
      VALUES ($1, now(), 300, $2)
      RETURNING *
      `,
      [userId, questions.length]
    );

    const session = sessionRes.rows[0];

    res.json({ ok: true, session, questions });
  } catch (err) {
    console.error("startQuiz error:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};


// submit answers for a session (array of {question_id, selected_option_id})

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

    res.json({ ok: true, score: correctCount, total: answers.length , data: quizsessionData.rows[0], });
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
      `SELECT a.*, q.question_text, q.options, q.correct_option_id
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
