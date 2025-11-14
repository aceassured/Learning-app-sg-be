import pool from "../../database.js";
import { uploadBufferToVercel } from "../utils/vercel-blob.js";
import sharp from "sharp";

// create poll...........


// export const admincreatePoll = async (req, res) => {
//   try {
//     const { question, allow_multiple = false, expires_at = null, options, subject_id, grade_level } = req.body;
//     const adminId = req.userId;; // assuming req.user is set after auth & role check

//     if (!question || !options || options.length < 2 || !subject_id || !grade_level) {
//       return res.status(400).json({ message: "Question and at least 2 options required" });
//     }

//     // Insert poll
//     const pollResult = await pool.query(
//       `INSERT INTO polls (question, allow_multiple, expires_at, subject_id, grade_level ) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
//       [question, allow_multiple, expires_at, subject_id, grade_level]
//     );

//     const poll = pollResult.rows[0];

//     // Insert poll options
//     const optionValues = options.map((opt) => `('${poll.id}', '${opt}')`).join(",");
//     await pool.query(`INSERT INTO poll_options (poll_id, option_text) VALUES ${optionValues}`);

//     // const mergeResult = [poll,]

//     return res.status(201).json({ message: "Poll created successfully", poll });
//   } catch (error) {
//     console.error("admincreatePoll error:", error);
//     return res.status(500).json({ message: "Internal server error" });
//   }
// };


// Admin create poll
export const admincreatePoll = async (req, res) => {
  try {
    const {
      question,
      allow_multiple = false,
      expires_at = null,
      subject_id,
      grade_level,
    } = req.body;
    const adminId = req.userId;

    let { options } = req.body;
    console.log("options", options);

    // Parse options if sent as a JSON string
    if (typeof options === "string") {
      try {
        options = JSON.parse(options);
      } catch {
        return res.status(400).json({
          message: "Invalid options format. Must be a JSON array.",
        });
      }
    }

    if ((!question && !req.file) || !subject_id || !grade_level) {
      return res.status(400).json({
        message:
          "Either question text or image, subject_id, and grade_level are required.",
      });
    }

    if (!Array.isArray(options)) {
      return res.status(400).json({ message: "Options must be an array." });
    }

    if (options.length < 2) {
      return res
        .status(400)
        .json({ message: "At least 2 options are required." });
    }

    let pollImageUrl = null;

    if (req.file) {
      // ✅ Step 1: Optimize the image
      const optimizedBuffer = await sharp(req.file.buffer)
        .resize({
          width: 1200, // max width
          withoutEnlargement: true,
        })
        .toFormat("jpeg", { quality: 85 }) // or .webp({ quality: 80 })
        .toBuffer();

      // ✅ Step 2: Upload the optimized buffer to Vercel Blob
      pollImageUrl = await uploadBufferToVercel(
        optimizedBuffer,
        req.file.originalname
      );
    }

    // ✅ Step 3: Store in PostgreSQL
    const pollResult = await pool.query(
      `INSERT INTO polls (question, allow_multiple, expires_at, subject_id, grade_level, poll_image_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [question || null, allow_multiple, expires_at, subject_id, grade_level, pollImageUrl]
    );

    const poll = pollResult.rows[0];

    const optionValues = options
      .map((opt) => `(${poll.id}, '${opt.replace(/'/g, "''")}')`)
      .join(",");

    await pool.query(
      `INSERT INTO poll_options (poll_id, option_text) VALUES ${optionValues}`
    );

    return res.status(201).json({ message: "Poll created successfully", poll });
  } catch (error) {
    console.error("admincreatePoll error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};



// edit poll...

// export const adminEditPoll = async (req, res) => {
//   try {
//     const { poll_id, question, allow_multiple, expires_at, options, subject_id, grade_level } = req.body;

//     if (!poll_id) {
//       return res.status(400).json({ message: "Poll ID is required" });
//     }

//     // Check if poll exists
//     const pollCheck = await pool.query(`SELECT * FROM polls WHERE id = $1`, [poll_id]);
//     if (pollCheck.rows.length === 0) {
//       return res.status(404).json({ message: "Poll not found" });
//     }

//     // Update poll table
//     const updatedPoll = await pool.query(
//       `UPDATE polls
//        SET question = $1,
//            allow_multiple = $2,
//            expires_at = $3,
//            subject_id = $4,
//            grade_level = $5,
//            updated_at = NOW()
//        WHERE id = $6
//        RETURNING *`,
//       [question, allow_multiple, expires_at, subject_id, grade_level, poll_id]
//     );

//     // Update poll options
//     if (options && Array.isArray(options) && options.length >= 2) {
//       // Delete existing options
//       await pool.query(`DELETE FROM poll_options WHERE poll_id = $1`, [poll_id]);

//       // Insert new options
//       const optionValues = options.map((opt) => `('${poll_id}', '${opt}')`).join(",");
//       await pool.query(`INSERT INTO poll_options (poll_id, option_text) VALUES ${optionValues}`);
//     }

//     return res.status(200).json({ message: "Poll updated successfully", poll: updatedPoll.rows[0] });

//   } catch (error) {
//     console.error("adminEditPoll error:", error);
//     return res.status(500).json({ message: "Internal server error" });
//   }
// };

export const adminEditPoll = async (req, res) => {
  try {
    const {
      poll_id,
      question,
      allow_multiple,
      expires_at,
      options,
      subject_id,
      grade_level,
    } = req.body;

    if (!poll_id) {
      return res.status(400).json({ message: "Poll ID is required" });
    }

    // 🧠 Check if poll exists
    const pollCheck = await pool.query(`SELECT * FROM polls WHERE id = $1`, [poll_id]);
    if (pollCheck.rows.length === 0) {
      return res.status(404).json({ message: "Poll not found" });
    }

    const existingPoll = pollCheck.rows[0];
    let pollImageUrl = existingPoll.poll_image_url;

    // 🖼️ If a new image file is uploaded → optimize & re-upload
    if (req.file) {
      const optimizedBuffer = await sharp(req.file.buffer)
        .resize({
          width: 1200,
          withoutEnlargement: true,
        })
        .toFormat("jpeg", { quality: 85 }) // or .webp({ quality: 80 })
        .toBuffer();

      pollImageUrl = await uploadBufferToVercel(
        optimizedBuffer,
        req.file.originalname
      );
    }

    // 🧩 Update poll main details
    const updatedPoll = await pool.query(
      `UPDATE polls
       SET question = $1,
           allow_multiple = $2,
           expires_at = $3,
           subject_id = $4,
           grade_level = $5,
           poll_image_url = $6,
           updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [
        question || null,
        allow_multiple,
        expires_at,
        subject_id,
        grade_level,
        pollImageUrl,
        poll_id,
      ]
    );

    // 🗳️ Update poll options (if provided)
    if (options) {
      let parsedOptions = options;

      if (typeof options === "string") {
        try {
          parsedOptions = JSON.parse(options);
        } catch {
          return res.status(400).json({
            message: "Invalid options format. Must be a JSON array.",
          });
        }
      }

      if (!Array.isArray(parsedOptions) || parsedOptions.length < 2) {
        return res
          .status(400)
          .json({ message: "At least 2 options are required." });
      }

      // Delete old options
      await pool.query(`DELETE FROM poll_options WHERE poll_id = $1`, [poll_id]);

      // Insert new options safely
      const optionValues = parsedOptions
        .map((opt) => `(${poll_id}, '${opt.replace(/'/g, "''")}')`)
        .join(",");

      await pool.query(
        `INSERT INTO poll_options (poll_id, option_text) VALUES ${optionValues}`
      );
    }

    return res.status(200).json({
      message: "Poll updated successfully",
      poll: updatedPoll.rows[0],
    });
  } catch (error) {
    console.error("adminEditPoll error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// get all active poll....

export const getAllpoll = async (req, res) => {
  try {
    const now = new Date();
    let { page = 1, limit = 10, search = "", subjectId, gradeId, startDate = "",
      endDate = "" } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);
    const offset = (page - 1) * limit;

    // Base query
    let baseQuery = `
      SELECT 
        p.id,
        p.is_poll_ended,
        p.question,
        p.allow_multiple,
        p.poll_image_url,
        p.expires_at,
        p.created_at,
        p.active_status,
        s.subject AS subject_name,
        g.grade_level AS grade_name
      FROM polls p
      LEFT JOIN subjects s ON s.id = p.subject_id
      LEFT JOIN grades g ON g.id = p.grade_level
      WHERE (p.expires_at IS NULL OR p.expires_at > $1)
        AND p.active_status = true
    `;

    const params = [now];
    const conditions = [];

    // ✅ Search by question text
    if (search && search.trim() !== "") {
      params.push(`%${search.toLowerCase()}%`);
      conditions.push(`LOWER(p.question) LIKE $${params.length}`);
    }

    // ✅ Subject filter
    if (subjectId) {
      params.push(subjectId);
      conditions.push(`p.subject_id = $${params.length}`);
    }

    // ✅ Grade filter
    if (gradeId) {
      params.push(gradeId);
      conditions.push(`p.grade_level = $${params.length}`);
    }

    // Date range filters
    if (startDate) {
      params.push(startDate);
      conditions.push(`DATE(p.created_at) >= $${params.length}`);
    }

    if (endDate) {
      params.push(endDate);
      conditions.push(`DATE(p.created_at) <= $${params.length}`);
    }

    // Add conditions if any
    if (conditions.length > 0) {
      baseQuery += " AND " + conditions.join(" AND ");
    }


    // Count total for pagination
    const countQuery = `SELECT COUNT(*) FROM (${baseQuery}) AS total`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Add pagination + sorting
    baseQuery += ` ORDER BY p.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    // Fetch paginated polls
    const polls = await pool.query(baseQuery, params);

    // ✅ Attach poll options + votes for each poll
    const pollsWithOptions = [];
    for (let poll of polls.rows) {
      const options = await pool.query(
        `SELECT 
           po.id, 
           po.option_text,
           COALESCE(COUNT(pv.id), 0) AS vote_count,
           COALESCE(
             json_agg(
               json_build_object('id', u.id, 'name', u.name)
             ) FILTER (WHERE u.id IS NOT NULL),
             '[]'
           ) AS voters
         FROM poll_options po
         LEFT JOIN poll_votes pv ON po.id = pv.option_id
         LEFT JOIN users u ON pv.user_id = u.id
         WHERE po.poll_id = $1
         GROUP BY po.id, po.option_text
         ORDER BY po.id`,
        [poll.id]
      );

      pollsWithOptions.push({
        ...poll,
        options: options.rows.map((o) => ({
          ...o,
          vote_count: Number(o.vote_count),
          voters: o.voters,
        })),
      });
    }

    // ✅ Final paginated response
    return res.json({
      ok: true,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      polls: pollsWithOptions,
    });
  } catch (error) {
    console.error("getAllpoll error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};



// admin announcement poll......

export const adminAnnouncementpoll = async (req, res) => {
  try {
    const { title, content } = req.body;
    const adminId = req.user.id; // assuming auth middleware sets this

    if (!title) return res.status(400).json({ message: "Title is required" });

    const result = await pool.query(
      `INSERT INTO announcements (admin_id, title, content) VALUES ($1,$2,$3) RETURNING *`,
      [adminId, title, content]
    );

    return res.status(201).json({ message: "Announcement created", announcement: result.rows[0] });
  } catch (error) {
    console.error("adminAnnouncementpoll error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};



// ✅ CREATE GRADE
export const createGrades = async (req, res) => {
  try {
    const { grade_level } = req.body;

    if (!grade_level)
      return res.status(400).json({ message: "Grade level is required" });

    const existing = await pool.query(
      "SELECT * FROM grades WHERE grade_level = $1 AND active_status = true",
      [grade_level]
    );

    if (existing.rows.length > 0)
      return res.status(400).json({ message: "Grade already exists" });

    const result = await pool.query(
      "INSERT INTO grades (grade_level, created_at, updated_at, active_status) VALUES ($1, NOW(), NOW(), true) RETURNING *",
      [grade_level]
    );

    res.status(201).json({ message: "Grade created successfully", data: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ✅ UPDATE GRADE
export const updateGrade = async (req, res) => {
  try {
    const { id } = req.body;
    const { grade_level } = req.body;

    if (!id || !grade_level)
      return res.status(400).json({ message: "ID and grade_level are required" });

    const grade = await pool.query("SELECT * FROM grades WHERE id = $1", [id]);
    if (grade.rows.length === 0)
      return res.status(404).json({ message: "Grade not found" });

    const updated = await pool.query(
      "UPDATE grades SET grade_level = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [grade_level, id]
    );

    res.json({ message: "Grade updated successfully", data: updated.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ✅ DELETE (soft delete) GRADE
export const deleteGrade = async (req, res) => {
  try {
    const { id } = req.body;

    const grade = await pool.query("SELECT * FROM grades WHERE id = $1", [id]);
    if (grade.rows.length === 0)
      return res.status(404).json({ message: "Grade not found" });

    await pool.query(
      "UPDATE grades SET active_status = false, updated_at = NOW() WHERE id = $1",
      [id]
    );

    res.json({ message: "Grade deleted successfully (soft delete)" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ======================================================
// ================ SUBJECTS API ========================
// ======================================================

// ✅ UPDATE SUBJECT
export const updateSubject = async (req, res) => {
  try {
    const { id } = req.body;
    const { subject, grade_id } = req.body;
    const file = req.file; // assuming multer middleware used

    if (!id) return res.status(400).json({ message: "ID is required" });

    const existing = await pool.query("SELECT * FROM subjects WHERE id = $1", [id]);
    if (existing.rows.length === 0)
      return res.status(404).json({ message: "Subject not found" });

    let iconUrl = existing.rows[0].icon;

    if (file) {
      const buffer = file.buffer;
      iconUrl = await uploadBufferToVercel(buffer, file.originalname);
    }

    const updated = await pool.query(
      "UPDATE subjects SET subject = COALESCE($1, subject), grade_id = COALESCE($2, grade_id), icon = $3, created_at = NOW() WHERE id = $4 RETURNING *",
      [subject, grade_id, iconUrl, id]
    );

    res.json({ message: "Subject updated successfully", data: updated.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ✅ DELETE SUBJECT (soft delete)
export const deleteSubject = async (req, res) => {
  try {
    const { id } = req.body;

    const subject = await pool.query("SELECT * FROM subjects WHERE id = $1", [id]);
    if (subject.rows.length === 0)
      return res.status(404).json({ message: "Subject not found" });

    await pool.query(
      "UPDATE subjects SET active_status = false WHERE id = $1",
      [id]
    );

    res.json({ message: "Subject deleted successfully (soft delete)" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ======================================================
// ================ TOPICS API ==========================
// ======================================================

// ✅ UPDATE TOPIC
export const updateTopics = async (req, res) => {
  try {
    const { id } = req.body;
    const { topic, subject_id, grade_id, grade_level } = req.body;

    if (!id) return res.status(400).json({ message: "ID is required" });

    const existing = await pool.query("SELECT * FROM topics WHERE id = $1", [id]);
    if (existing.rows.length === 0)
      return res.status(404).json({ message: "Topic not found" });

    const updated = await pool.query(
      `UPDATE topics 
       SET topic = COALESCE($1, topic), 
           subject_id = COALESCE($2, subject_id), 
           grade_id = COALESCE($3, grade_id), 
           grade_level = COALESCE($4, grade_level),
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [topic, subject_id, grade_id, grade_level, id]
    );

    res.json({ message: "Topic updated successfully", data: updated.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ✅ DELETE TOPIC (soft delete)
export const deleteTopic = async (req, res) => {
  try {
    const { id } = req.body;

    const topic = await pool.query("SELECT * FROM topics WHERE id = $1", [id]);
    if (topic.rows.length === 0)
      return res.status(404).json({ message: "Topic not found" });

    await pool.query(
      "UPDATE topics SET active_status = false, updated_at = NOW() WHERE id = $1",
      [id]
    );

    res.json({ message: "Topic deleted successfully (soft delete)" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};


// delete poll......

export const deletePoll = async (req, res) => {
  try {
    const { id } = req.body;

    // 1️⃣ Check if the poll exists
    const poll = await pool.query("SELECT * FROM polls WHERE id = $1", [id]);

    if (poll.rows.length === 0) {
      return res.status(404).json({ message: "Poll not found" });
    }

    // 2️⃣ Perform soft delete
    await pool.query(
      "UPDATE polls SET active_status = false, updated_at = NOW() WHERE id = $1",
      [id]
    );

    // 3️⃣ Send response
    res.status(200).json({ message: "Poll deleted successfully" });
  } catch (error) {
    console.error("Error deleting poll:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// create editing quiz.......

export const adminCreateEditQuiz = async (req, res) => {

  try {
    const { title, passage, grade_id, subject_id, topic_id, questions } = req.body;

    if (!title || !passage || !grade_id || !subject_id || !topic_id) {
      return res.status(400).json({ error: "All fields are required" });
    }

    // Insert quiz
    const quizResult = await pool.query(
      `INSERT INTO editing_quiz (title, passage, grade_id, subject_id, topic_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [title, passage, grade_id, subject_id, topic_id]
    );

    const quiz = quizResult.rows[0];

    // Insert questions
    if (questions && Array.isArray(questions)) {
      for (const q of questions) {
        await pool.query(
          `INSERT INTO editing_quiz_questions (quiz_id, incorrect_word, correct_word, position)
           VALUES ($1, $2, $3, $4)`,
          [quiz.id, q.incorrect_word, q.correct_word, q.position]
        );
      }
    }

    res.status(201).json({ message: "Quiz created successfully", quiz });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }

};


// user get editing quiz..........

export const getUserEditingQuiz = async (req, res) => {
  try {
    const { grade_id, subject_id, topic_id } = req.query;

    let query = `
      SELECT eq.*, 
             g.grade_level AS grade_name,
             s.subject AS subject_name,
             t.topic AS topic_name
      FROM editing_quiz eq
      LEFT JOIN grades g ON eq.grade_id = g.id
      LEFT JOIN subjects s ON eq.subject_id = s.id
      LEFT JOIN topics t ON eq.topic_id = t.id
      WHERE 1=1
    `;
    const params = [];

    if (grade_id) {
      params.push(grade_id);
      query += ` AND eq.grade_id = $${params.length}`;
    }

    if (subject_id) {
      params.push(subject_id);
      query += ` AND eq.subject_id = $${params.length}`;
    }

    if (topic_id) {
      params.push(topic_id);
      query += ` AND eq.topic_id = $${params.length}`;
    }

    query += " ORDER BY eq.created_at DESC";

    const { rows } = await pool.query(query, params);

    // optional: also fetch questions for each quiz
    for (let quiz of rows) {
      const qRes = await pool.query(
        "SELECT id, incorrect_word, correct_word, position FROM editing_quiz_questions WHERE quiz_id = $1 ORDER BY position ASC",
        [quiz.id]
      );
      quiz.questions = qRes.rows;
    }

    res.status(200).json(rows);
  } catch (err) {
    console.error("Error fetching editing quizzes:", err);
    res.status(500).json({ error: "Server error" });
  }
}

// get all editable question.......

export const getAllEditQuizzes = async (req, res) => {
  try {
    const { search = "" } = req.query;

    const result = await pool.query(
      `
      SELECT 
        eq.id,
        eq.title,
        eq.passage,
        eq.grade_id,
        g.grade_level AS grade_name,
        eq.subject_id,
        s.subject AS subject_name,
        eq.topic_id,
        t.topic As topic_name,
        eq.created_at
      FROM editing_quiz eq
      LEFT JOIN editing_quiz_questions qq ON eq.id = qq.quiz_id
      LEFT JOIN grades g ON eq.grade_id = g.id
      LEFT JOIN subjects s ON eq.subject_id = s.id
      LEFT JOIN topics t ON eq.topic_id = t.id
      WHERE LOWER(eq.title) LIKE LOWER($1) 
         OR LOWER(eq.passage) LIKE LOWER($1)
         OR LOWER(g.grade_level) LIKE LOWER($1)
         OR LOWER(s.subject) LIKE LOWER($1)
         OR LOWER(t.topic) LIKE LOWER($1)
      GROUP BY 
        eq.id, g.grade_level, s.subject, t.topic
      ORDER BY eq.created_at DESC
      `,
      [`%${search}%`]
    );

    res.status(200).json({
      message: "All editable quizzes fetched successfully",
      quizzes: result.rows,
    });
  } catch (err) {
    console.error("Error fetching editable quizzes:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// getAllEditQuizzes new............

export const getAllEditQuizzesnew = async (req, res) => {
  try {
    let {
      search = "",
      subject_id,
      topic_id,
      grade_id,
      start_date = "",
      end_date = "",
      page = 1,
      limit = 10,
    } = req.query;

    page = parseInt(page, 10);
    limit = parseInt(limit, 10);
    const offset = (page - 1) * limit;

    const whereClauses = [];
    const values = [];
    let idx = 1;

    if (subject_id) {
      whereClauses.push(`eq.subject_id = $${idx++}`);
      values.push(subject_id);
    }

    if (topic_id) {
      whereClauses.push(`eq.topic_id = $${idx++}`);
      values.push(topic_id);
    }

    if (grade_id) {
      whereClauses.push(`eq.grade_id = $${idx++}`);
      values.push(grade_id);
    }

    // Date range filter
    if (start_date && end_date) {
      whereClauses.push(`DATE(eq.created_at) BETWEEN $${idx} AND $${idx + 1}`);
      values.push(start_date, end_date);
      idx += 2;
    } else if (start_date) {
      whereClauses.push(`DATE(eq.created_at) >= $${idx++}`);
      values.push(start_date);
    } else if (end_date) {
      whereClauses.push(`DATE(eq.created_at) <= $${idx++}`);
      values.push(end_date);
    }

    if (search) {
      whereClauses.push(`
        (
          LOWER(eq.title) LIKE LOWER($${idx})
          OR LOWER(eq.passage) LIKE LOWER($${idx})
          OR LOWER(g.grade_level) LIKE LOWER($${idx})
          OR LOWER(s.subject) LIKE LOWER($${idx})
          OR LOWER(t.topic) LIKE LOWER($${idx})
        )
      `);
      values.push(`%${search}%`);
      idx++;
    }

    const whereQuery =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const limitPlaceholder = `$${idx++}`;
    const offsetPlaceholder = `$${idx++}`;

    const query = `
      SELECT 
        eq.id, eq.title, eq.passage, eq.grade_id,
        g.grade_level AS grade_name,
        eq.subject_id, s.subject AS subject_name,
        eq.topic_id, t.topic AS topic_name,
        eq.created_at
      FROM editing_quiz eq
      LEFT JOIN grades g ON eq.grade_id = g.id
      LEFT JOIN subjects s ON eq.subject_id = s.id
      LEFT JOIN topics t ON eq.topic_id = t.id
      ${whereQuery}
      GROUP BY eq.id, g.grade_level, s.subject, t.topic
      ORDER BY eq.created_at DESC
      LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder};
    `;

    const mainValues = [...values, limit, offset];

    const countQuery = `
      SELECT COUNT(DISTINCT eq.id) AS total
      FROM editing_quiz eq
      LEFT JOIN grades g ON eq.grade_id = g.id
      LEFT JOIN subjects s ON eq.subject_id = s.id
      LEFT JOIN topics t ON eq.topic_id = t.id
      ${whereQuery};
    `;

    const [result, countResult] = await Promise.all([
      pool.query(query, mainValues),
      pool.query(countQuery, values),
    ]);

    const total = parseInt(countResult.rows[0].total, 10);
    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      message: "Editable quizzes fetched successfully",
      total,
      totalPages,
      currentPage: page,
      perPage: limit,
      quizzes: result.rows,
    });
  } catch (err) {
    console.error("Error fetching editable quizzes:", err);
    res.status(500).json({ error: "Server error" });
  }
};



// update editable question.....

export const updateEditQuiz = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, passage, grade_id, subject_id, topic_id, questions } = req.body;

    const existingQuiz = await pool.query(`SELECT * FROM editing_quiz WHERE id = $1`, [id]);
    if (existingQuiz.rowCount === 0) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    // Update quiz details
    await pool.query(
      `UPDATE editing_quiz
       SET title = $1, passage = $2, grade_id = $3, subject_id = $4, topic_id = $5, updated_at = NOW()
       WHERE id = $6`,
      [title, passage, grade_id, subject_id, topic_id, id]
    );

    // Delete old questions
    await pool.query(`DELETE FROM editing_quiz_questions WHERE quiz_id = $1`, [id]);

    // Insert new questions
    if (questions && Array.isArray(questions)) {
      for (const q of questions) {
        await pool.query(
          `INSERT INTO editing_quiz_questions (quiz_id, incorrect_word, correct_word, position)
           VALUES ($1, $2, $3, $4)`,
          [id, q.incorrect_word, q.correct_word, q.position]
        );
      }
    }

    res.status(200).json({ message: "Quiz updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};


// delete editabe qustion.......


export const deleteEditQuiz = async (req, res) => {
  try {
    const { id } = req.params;

    const quiz = await pool.query(`SELECT * FROM editing_quiz WHERE id = $1`, [id]);
    if (quiz.rowCount === 0) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    // Delete related questions first
    await pool.query(`DELETE FROM editing_quiz_questions WHERE quiz_id = $1`, [id]);
    // Delete quiz
    await pool.query(`DELETE FROM editing_quiz WHERE id = $1`, [id]);

    res.status(200).json({ message: "Quiz deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};


// get particularquestions..........

export const getParticularEditableQuiz = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "Quiz ID is required" });
    }

    // Fetch quiz details with joins
    const quizResult = await pool.query(
      `
      SELECT 
        eq.id,
        eq.title,
        eq.passage,
        eq.grade_id,
        g.grade_level AS grade_name,
        eq.subject_id,
        s.subject AS subject_name,
        eq.topic_id,
        t.topic AS topic_name,
        eq.created_at
      FROM editing_quiz eq
      LEFT JOIN grades g ON eq.grade_id = g.id
      LEFT JOIN subjects s ON eq.subject_id = s.id
      LEFT JOIN topics t ON eq.topic_id = t.id
      WHERE eq.id = $1
      `,
      [id]
    );

    if (quizResult.rowCount === 0) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    const quiz = quizResult.rows[0];

    // Fetch all questions for the quiz
    const questionsResult = await pool.query(
      `
      SELECT 
        id,
        incorrect_word,
        correct_word,
        position
      FROM editing_quiz_questions
      WHERE quiz_id = $1
      ORDER BY position ASC
      `,
      [id]
    );

    quiz.questions = questionsResult.rows;

    res.status(200).json({
      message: "Editable quiz fetched successfully",
      quiz,
    });
  } catch (err) {
    console.error("Error fetching particular editable quiz:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// admin update active inactive user.......

export const adminUpdateUserStatus = async (req, res) => {
  try {
    const { id, user_type } = req.body;

    if (!id || !user_type) {
      return res.status(400).json({ message: "id and user_type are required" });
    }

    let tableName;
    if (user_type === "user") {
      tableName = "users";
    } else if (user_type === "admin") {
      tableName = "admins";
    } else {
      return res.status(400).json({ message: "Invalid user_type" });
    }

    // Get current active_status
    const findQuery = `SELECT active_status FROM ${tableName} WHERE id = $1`;
    const result = await pool.query(findQuery, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: `${user_type} not found` });
    }

    const currentStatus = result.rows[0].active_status;
    const newStatus = !currentStatus; // toggle true/false

    // Update query
    const updateQuery = `
      UPDATE ${tableName}
      SET active_status = $1
      WHERE id = $2
      RETURNING id, active_status, is_active_request;
    `;
    const updated = await pool.query(updateQuery, [newStatus, id]);

    return res.status(200).json({
      message: "Status updated successfully",
      data: updated.rows[0],
    });
  } catch (error) {
    console.error("Error updating user status:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};


// get all questions..........


export const getAllQuestionsnew = async (req, res) => {
  try {
    let {
      subject_id,
      topic_id,
      grade_id,
      search = "",
      start_date = "",
      end_date = "",
      page = 1,
      limit = 10,
    } = req.query;

    page = Math.max(parseInt(page, 10) || 1, 1);
    limit = Math.max(parseInt(limit, 10) || 10, 1);
    const offset = (page - 1) * limit;

    const whereClauses = [];
    const values = [];
    let idx = 1;

    if (subject_id) {
      whereClauses.push(`q.subject_id = $${idx++}`);
      values.push(subject_id);
    }

    if (topic_id) {
      whereClauses.push(`q.topic_id = $${idx++}`);
      values.push(topic_id);
    }

    if (grade_id) {
      whereClauses.push(`q.grade_id = $${idx++}`);
      values.push(grade_id);
    }

    // Date filter
    if (start_date && end_date) {
      whereClauses.push(`DATE(q.created_at) BETWEEN $${idx} AND $${idx + 1}`);
      values.push(start_date, end_date);
      idx += 2;
    } else if (start_date) {
      whereClauses.push(`DATE(q.created_at) >= $${idx++}`);
      values.push(start_date);
    } else if (end_date) {
      whereClauses.push(`DATE(q.created_at) <= $${idx++}`);
      values.push(end_date);
    }

    if (search.trim() !== "") {
      whereClauses.push(`q.question_text ILIKE $${idx++}`);
      values.push(`%${search.trim()}%`);
    }

    const whereQuery =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const limitPlaceholder = `$${idx++}`;
    const offsetPlaceholder = `$${idx++}`;

    const query = `
      SELECT 
        q.id,
        q.question_text,
        q.subject_id,
        q.options,
        q.correct_option_id,
        s.subject AS subject_name,
        q.topic_id,
        t.topic AS topic_name,
        q.grade_id,
        g.grade_level AS grade_name,
        q.created_at
      FROM questions q
      LEFT JOIN subjects s ON q.subject_id = s.id
      LEFT JOIN topics t ON q.topic_id = t.id
      LEFT JOIN grades g ON q.grade_id = g.id
      ${whereQuery}
      ORDER BY q.created_at DESC
      LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder};
    `;

    const mainValues = [...values, limit, offset];

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM questions q
      ${whereQuery};
    `;

    const [result, countResult] = await Promise.all([
      pool.query(query, mainValues),
      pool.query(countQuery, values),
    ]);

    const total = parseInt(countResult.rows[0]?.total || 0, 10);
    const totalPages = Math.ceil(total / limit);

    return res.status(200).json({
      message: "Questions fetched successfully",
      total,
      totalPages,
      currentPage: page,
      perPage: limit,
      questions: result.rows,
    });
  } catch (error) {
    console.error("Error fetching questions:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};





// Create bulk editing quiz questions

// adminBulkQuizOptionA.js

// Adding new controller function for bulk upload of editable quiz questions
export const adminCreateBulkEditableQuizQuestions = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded; field name must be 'file'." });

  let workbook;
  try {
    workbook = xlsx.read(req.file.buffer, { type: "buffer" });
  } catch (err) {
    return res.status(400).json({ error: "Invalid Excel file.", detail: err.message });
  }

  const sheetName = workbook.SheetNames[0];
  const rawRows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });

  if (!rawRows || rawRows.length === 0) {
    return res.status(400).json({ error: "Excel is empty" });
  }

  // create a batch id for this upload
  const uploadBatchId = uuidv4();

  // compute file hash (sha256) for exact-file duplication detection
  const fileHash = crypto.createHash("sha256").update(req.file.buffer).digest("hex");


  // Preload lookup tables
  try {
    const [gradesRes, subjectsRes, topicsRes] = await Promise.all([
      pool.query('SELECT id, grade_level FROM grades'),
      pool.query('SELECT id, subject, grade_id FROM subjects'),
      pool.query('SELECT id, topic, subject_id, grade_id FROM topics'),
    ]);

    const gradeMap = new Map();
    gradesRes.rows.forEach(g => gradeMap.set(norm(g.grade_level), g.id));

    const subjectMap = new Map();
    subjectsRes.rows.forEach(s => subjectMap.set(norm(s.subject), s));

    const topicMap = new Map(); // key = norm(topic) + '||' + subject_id
    topicsRes.rows.forEach(t => topicMap.set(`${norm(t.topic)}||${t.subject_id}`, t));

    // Process rows in order, respecting type=quiz / type=question logic
    const errors = [];
    const quizzesInFile = []; // ordered list of {meta, questions:[]}
    let currentQuizMeta = null;
    let rowIndex = 1; // 1-based for human friendly messages (first data row = 1)

    for (const raw of rawRows) {
      const row = {};
      // normalize keys to lowercase to tolerate Excel casing
      Object.keys(raw).forEach(k => {
        row[k.toString().toLowerCase()] = raw[k];
      });

      const type = (row.type ?? "").toString().trim().toLowerCase();
      if (!type) {
        errors.push({ row: rowIndex, message: "Missing 'type' (must be 'quiz' or 'question')" });
        rowIndex++;
        continue;
      }

      if (type !== "quiz" && type !== "question") {
        errors.push({ row: rowIndex, message: `Invalid type '${row.type}'; allowed: 'quiz' or 'question'` });
        rowIndex++;
        continue;
      }

      if (type === "quiz") {
        // read header fields from this row
        const title = (row.title ?? "").toString().trim();
        const passage = (row.passage ?? "").toString().trim();
        const grade_level = (row.grade_level ?? row.grade ?? "").toString().trim();
        const subjectText = (row.subject ?? "").toString().trim();
        const topicText = (row.topic ?? "").toString().trim();

        if (!title) errors.push({ row: rowIndex, field: "title", message: "Missing title in quiz row" });
        if (!passage) errors.push({ row: rowIndex, field: "passage", message: "Missing passage in quiz row" });
        if (!grade_level) errors.push({ row: rowIndex, field: "grade_level", message: "Missing grade_level in quiz row" });
        if (!subjectText) errors.push({ row: rowIndex, field: "subject", message: "Missing subject in quiz row" });
        if (!topicText) errors.push({ row: rowIndex, field: "topic", message: "Missing topic in quiz row" });

        const grade_id = gradeMap.get(norm(grade_level)) ?? null;
        if (!grade_id) errors.push({ row: rowIndex, field: "grade_level", message: `Grade '${grade_level}' not found` });

        const subjRow = subjectMap.get(norm(subjectText)) ?? null;
        if (!subjRow) errors.push({ row: rowIndex, field: "subject", message: `Subject '${subjectText}' not found` });

        let topicRow = null;
        if (subjRow) {
          topicRow = topicMap.get(`${norm(topicText)}||${subjRow.id}`) ?? null;
          if (!topicRow) errors.push({ row: rowIndex, field: "topic", message: `Topic '${topicText}' not found under subject '${subjectText}'` });
        }

        currentQuizMeta = {
          rowNumber: rowIndex,
          title,
          passage,
          grade_level,
          grade_id,
          subject: subjectText,
          subject_id: subjRow ? subjRow.id : null,
          topic: topicText,
          topic_id: topicRow ? topicRow.id : null,
          questions: [],
        };

        quizzesInFile.push(currentQuizMeta);
      } else { // question row
        if (!currentQuizMeta) {
          errors.push({ row: rowIndex, message: "Question row appeared before any quiz header" });
          rowIndex++;
          continue;
        }

        const incorrect_word = (row.incorrect_word ?? row.incorrect ?? "").toString().trim();
        const correct_word = (row.correct_word ?? row.correct ?? "").toString().trim();
        const posRaw = (row.position ?? "").toString().trim();

        if (!incorrect_word) errors.push({ row: rowIndex, field: "incorrect_word", message: "Missing incorrect_word in question row" });
        if (!correct_word) errors.push({ row: rowIndex, field: "correct_word", message: "Missing correct_word in question row" });

        let position = null;
        if (posRaw !== "") {
          const parsed = parseInt(posRaw, 10);
          if (Number.isNaN(parsed)) {
            errors.push({ row: rowIndex, field: "position", message: `Invalid position '${posRaw}'` });
          } else {
            position = parsed;
          }
        }

        currentQuizMeta.questions.push({
          rowNumber: rowIndex,
          incorrect_word,
          correct_word,
          position,
        });
      }

      rowIndex++;
    } // end for rows

    if (errors.length > 0) {
      return res.status(400).json({ error: "Validation failed", details: errors });
    }

    // Validate per-quiz positions: fill missing positions; ensure uniqueness within quiz
    const perQuizIssues = [];
    for (const q of quizzesInFile) {
      // NEW VALIDATION: quiz must have at least 1 question
      if (q.questions.length === 0) {
        perQuizIssues.push({
          row: q.rowNumber,
          message: "Each quiz must contain at least one question"
        });
        continue;
      }

      // assign positions sequentially if not provided - start from 1 in-file
      let nextPos = 1;
      // if some positions provided, keep them and fill gaps with next available numbers
      for (const question of q.questions) {
        if (question.position == null) {
          while (q.questions.some(x => x.position === nextPos)) nextPos++;
          question.position = nextPos;
          nextPos++;
        }
      }
      // check duplicates
      const seen = new Set();
      for (const question of q.questions) {
        if (seen.has(question.position)) {
          perQuizIssues.push({ quizRow: q.rowNumber, row: question.rowNumber, message: `Duplicate position ${question.position} in same quiz` });
        } else {
          seen.add(question.position);
        }
      }
    }
    if (perQuizIssues.length > 0) {
      return res.status(400).json({ error: "Position validation failed", details: perQuizIssues });
    }

    // ===================================================================
    // Compute a deterministic questions hash for content-duplicate detection
    // ===================================================================
    const generateQuestionsHash = (quizzes) => {
      // produce a stable representation: sort quizzes and questions
      const normalized = quizzes.map(qz => ({
        title: qz.title ?? "",
        passage: qz.passage ?? "",
        grade_id: qz.grade_id ?? null,
        subject_id: qz.subject_id ?? null,
        topic_id: qz.topic_id ?? null,
        questions: (qz.questions || []).map(qq => ({
          incorrect_word: qq.incorrect_word ?? "",
          correct_word: qq.correct_word ?? "",
          position: qq.position ?? 0
        })).sort((a, b) => (a.position - b.position))
      })).sort((a, b) => a.title.localeCompare(b.title));

      const str = JSON.stringify(normalized);
      return crypto.createHash('sha256').update(str).digest('hex');
    };

    const questionsHash = generateQuestionsHash(quizzesInFile);

    // ===================================================================
    // Duplicate check: if same file bytes OR same questions content exists
    // ===================================================================
    const dupCheck = await pool.query(
      `SELECT id, filename, uploaded_at, questions_count 
      FROM upload_history 
      WHERE file_hash = $1 OR questions_hash = $2
      LIMIT 1`,
      [fileHash, questionsHash]
    );

    if (dupCheck.rowCount > 0) {
      const dup = dupCheck.rows[0];
      return res.status(400).json({
        error: "Duplicate upload",
        detail: [
          {
            message: `This file or identical questions were already uploaded as "${dup.filename}" on ${dup.uploaded_at}. It contains ${dup.questions_count} questions.`
          }
        ]
      });
    }


    // ensure batch id doesn't already exist
    const exists = await pool.query(
      "SELECT 1 FROM upload_history WHERE upload_batch_id = $1 LIMIT 1",
      [uploadBatchId]
    );

    if (exists.rowCount > 0) {
      return res.status(400).json({
        error: "Duplicate upload",
        detail: [
          {
            message: `Upload batch ID ${uploadBatchId} has already been used. Please try uploading again.`,
          }
        ]
      });
    }


    // Start DB transaction and insert/create or append as per option C
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const createdOrUpdated = [];

      for (const q of quizzesInFile) {
        // ensure foreign ids exist (should be validated earlier but double-check)
        if (!q.grade_id || !q.subject_id || !q.topic_id) {
          throw new Error(`Internal mapping missing for quiz at row ${q.rowNumber}`);
        }

        // find existing quiz by unique key: title (case-insensitive) + grade_id + subject_id + topic_id
        const findQuizSql = `
          SELECT id FROM editing_quiz
          WHERE lower(title) = lower($1) AND grade_id = $2 AND subject_id = $3 AND topic_id = $4
          LIMIT 1
        `;
        const findQuizRes = await client.query(findQuizSql, [q.title, q.grade_id, q.subject_id, q.topic_id]);

        let quizId;
        let action; // 'created' or 'appended'

        if (findQuizRes.rowCount > 0) {
          // append to existing quiz
          quizId = findQuizRes.rows[0].id;
          action = "appended";

          // fetch current max position for this quiz to avoid collisions if input positions overlap
          const maxPosRes = await client.query(
            `SELECT COALESCE(MAX(position), 0) as max_pos FROM editing_quiz_questions WHERE quiz_id = $1`,
            [quizId]
          );
          const existingMax = parseInt(maxPosRes.rows[0].max_pos, 10);

          // If any incoming question positions collide with existing ones, we will shift incoming positions up
          // Strategy: If incoming positions are 1..n and existingMax >= 1, we'll add existingMax to incoming positions
          // But preserve explicit absolute positions if admin expects absolute positions — safer to shift.
          // We'll shift all incoming positions by existingMax to append them at the end while preserving relative ordering.
          const shift = existingMax;
          const values = [];
          const params = [];
          let p = 1;
          for (const question of q.questions) {
            const finalPos = question.position + shift;
            params.push(quizId, question.incorrect_word, question.correct_word, finalPos, uploadBatchId);
            values.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
          }
          if (values.length > 0) {
            const insertQSql = `INSERT INTO editing_quiz_questions (quiz_id, incorrect_word, correct_word, position, upload_batch_id) VALUES ${values.join(", ")}`;
            await client.query(insertQSql, params);
          }
        } else {
          // create new quiz row
          const insertQuizSql = `
            INSERT INTO editing_quiz (title, passage, grade_id, subject_id, topic_id, upload_batch_id)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
          `;
          const insertRes = await client.query(insertQuizSql, [q.title, q.passage, q.grade_id, q.subject_id, q.topic_id, uploadBatchId]);
          quizId = insertRes.rows[0].id;
          action = "created";

          // Insert provided questions as-is (positions already validated and unique within file)
          if (q.questions.length > 0) {
            const values = [];
            const params = [];
            let p = 1;
            for (const question of q.questions) {
              params.push(quizId, question.incorrect_word, question.correct_word, question.position, uploadBatchId);
              values.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
            }
            const insertQSql = `INSERT INTO editing_quiz_questions (quiz_id, incorrect_word, correct_word, position, upload_batch_id) VALUES ${values.join(", ")}`;
            await client.query(insertQSql, params);
          }
        }

        createdOrUpdated.push({
          quizTitle: q.title,
          quizRow: q.rowNumber,
          action,
          quizId,
          questionsInserted: q.questions.length,
        });
      } // end for quizzesInFile

      await client.query(
        `INSERT INTO upload_history 
    (filename, questions_count, upload_batch_id, status, file_hash, questions_hash, type)
   VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          req.file.originalname,
          createdOrUpdated.reduce((sum, q) => sum + q.questionsInserted, 0),
          uploadBatchId,
          "success",
          fileHash,
          questionsHash,
          "editable"
        ]
      );

      await client.query("COMMIT");

      return res.status(201).json({ message: "Bulk import processed", results: createdOrUpdated });

    } catch (err) {
      await client.query("ROLLBACK");
      //     await pool.query(
      //       `INSERT INTO upload_history 
      //   (filename, questions_count, upload_batch_id, status, type)
      //  VALUES ($1, $2, $3, $4, $5)`,
      //       [
      //         req.file?.originalname || "unknown",
      //         0,
      //         uploadBatchId,
      //         "failed",
      //         "editable"
      //       ]
      //     );
      console.error("Transaction error:", err);
      return res.status(500).json({ error: "Database transaction failed", detail: err.message });
    } finally {
      client.release();
    }

  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "Server error", detail: err.message });
  }

};

// get editable upload history.......
export const getEditableUploadHistory = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM upload_history
      WHERE type = 'editable'
      ORDER BY uploaded_at DESC
    `);

    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error fetching editable upload history" });
  }
};

// delete editable upload history.......
export const deleteEditableUpload = async (req, res) => {
  const { uploadId } = req.params;

  try {
    const result = await pool.query(
      `SELECT upload_batch_id, filename FROM upload_history WHERE id = $1 AND type = 'editable'`,
      [uploadId]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ success: false, message: "Upload not found" });

    const { upload_batch_id, filename } = result.rows[0];

    // delete questions
    await pool.query(
      `DELETE FROM editing_quiz_questions WHERE upload_batch_id = $1`,
      [upload_batch_id]
    );

    // delete quizzes
    await pool.query(
      `DELETE FROM editing_quiz WHERE upload_batch_id = $1`,
      [upload_batch_id]
    );

    // delete history record
    await pool.query(`DELETE FROM upload_history WHERE id = $1`, [uploadId]);

    res.json({
      success: true,
      message: `Successfully deleted upload "${filename}" and all associated quizzes + questions`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error deleting upload", error: err.message });
  }
};

// Get all the questions for a specific editing file upload
export const getEditableUploadData = async (req, res) => {
  const { uploadBatchId } = req.params;

  try {
    const quizzes = await pool.query(
      `SELECT * FROM editing_quiz WHERE upload_batch_id = $1`,
      [uploadBatchId]
    );

    const questions = await pool.query(
      `SELECT * FROM editing_quiz_questions WHERE upload_batch_id = $1`,
      [uploadBatchId]
    );

    res.json({
      success: true,
      quizzes: quizzes.rows,
      questions: questions.rows,
      total_questions: questions.rows.length
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Error fetching upload data",
      error: err.message
    });
  }
};