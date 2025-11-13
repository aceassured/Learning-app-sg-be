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
    let { page = 1, limit = 10, search = "", subjectId, gradeId } = req.query;

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
      page = 1,
      limit = 10,
    } = req.query;

    // Convert pagination values
    page = parseInt(page, 10);
    limit = parseInt(limit, 10);
    const offset = (page - 1) * limit;

    // Dynamic WHERE conditions
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

    const whereQuery = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    // Add placeholders for pagination
    const limitPlaceholder = `$${idx++}`;
    const offsetPlaceholder = `$${idx++}`;

    // Main query (with pagination)
    const query = `
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
      ${whereQuery}
      GROUP BY eq.id, g.grade_level, s.subject, t.topic
      ORDER BY eq.created_at DESC
      LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder};
    `;
    const mainValues = [...values, limit, offset];

    // Count query (for pagination)
    const countQuery = `
      SELECT COUNT(DISTINCT eq.id) AS total
      FROM editing_quiz eq
      LEFT JOIN grades g ON eq.grade_id = g.id
      LEFT JOIN subjects s ON eq.subject_id = s.id
      LEFT JOIN topics t ON eq.topic_id = t.id
      ${whereQuery};
    `;

    // Execute both queries in parallel
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
      page = 1,
      limit = 10,
    } = req.query;

    // Convert pagination inputs safely
    page = Math.max(parseInt(page, 10) || 1, 1);
    limit = Math.max(parseInt(limit, 10) || 10, 1);
    const offset = (page - 1) * limit;

    // Build dynamic filters
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

    if (search.trim() !== "") {
      whereClauses.push(`q.question_text ILIKE $${idx++}`);
      values.push(`%${search.trim()}%`);
    }

    // Combine WHERE conditions
    const whereQuery =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    // Add limit and offset placeholders
    const limitPlaceholder = `$${idx++}`;
    const offsetPlaceholder = `$${idx++}`;

    // Main query
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

    // Values for main query (filters + pagination)
    const mainValues = [...values, limit, offset];

    // Count query
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM questions q
      ${whereQuery};
    `;

    // Execute both queries
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




