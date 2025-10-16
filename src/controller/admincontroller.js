import pool from "../../database.js";
import { uploadBufferToVercel } from "../utils/vercel-blob.js";


// create poll...........


export const admincreatePoll = async (req, res) => {
  try {
    const { question, allow_multiple = false, expires_at = null, options, subject_id, grade_level } = req.body;
    const adminId = req.userId;; // assuming req.user is set after auth & role check

    if (!question || !options || options.length < 2 || !subject_id || !grade_level) {
      return res.status(400).json({ message: "Question and at least 2 options required" });
    }

    // Insert poll
    const pollResult = await pool.query(
      `INSERT INTO polls (question, allow_multiple, expires_at, subject_id, grade_level ) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [question, allow_multiple, expires_at, subject_id, grade_level]
    );

    const poll = pollResult.rows[0];

    // Insert poll options
    const optionValues = options.map((opt) => `('${poll.id}', '${opt}')`).join(",");
    await pool.query(`INSERT INTO poll_options (poll_id, option_text) VALUES ${optionValues}`);

    // const mergeResult = [poll,]

    return res.status(201).json({ message: "Poll created successfully", poll });
  } catch (error) {
    console.error("admincreatePoll error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};


// edit poll...

export const adminEditPoll = async (req, res) => {
  try {
    const { poll_id, question, allow_multiple, expires_at, options, subject_id, grade_level } = req.body;

    if (!poll_id) {
      return res.status(400).json({ message: "Poll ID is required" });
    }

    // Check if poll exists
    const pollCheck = await pool.query(`SELECT * FROM polls WHERE id = $1`, [poll_id]);
    if (pollCheck.rows.length === 0) {
      return res.status(404).json({ message: "Poll not found" });
    }

    // Update poll table
    const updatedPoll = await pool.query(
      `UPDATE polls
       SET question = $1,
           allow_multiple = $2,
           expires_at = $3,
           subject_id = $4,
           grade_level = $5,
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [question, allow_multiple, expires_at, subject_id, grade_level, poll_id]
    );

    // Update poll options
    if (options && Array.isArray(options) && options.length >= 2) {
      // Delete existing options
      await pool.query(`DELETE FROM poll_options WHERE poll_id = $1`, [poll_id]);

      // Insert new options
      const optionValues = options.map((opt) => `('${poll_id}', '${opt}')`).join(",");
      await pool.query(`INSERT INTO poll_options (poll_id, option_text) VALUES ${optionValues}`);
    }

    return res.status(200).json({ message: "Poll updated successfully", poll: updatedPoll.rows[0] });

  } catch (error) {
    console.error("adminEditPoll error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};



// get all active poll....

export const getAllpoll = async (req, res) => {
  try {
    const now = new Date();

    // get all active polls
    const polls = await pool.query(
      `SELECT * FROM polls 
   WHERE (expires_at IS NULL OR expires_at > $1)
     AND active_status = true
   ORDER BY created_at DESC`,
      [now]
    );


    const pollsWithOptions = [];
    for (let poll of polls.rows) {
      // fetch options + votes + user names
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
          vote_count: Number(o.vote_count), // convert from string to number
          voters: o.voters, // array of {id, name}
        })),
      });
    }

    return res.json(pollsWithOptions);
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

