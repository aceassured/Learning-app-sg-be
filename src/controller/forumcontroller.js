// src/controller/forumcontroller.js
import pool from '../../database.js';
import { uploadBufferToVercel } from '../utils/vercel-blob.js';

// export const listPosts = async (req, res) => {
//   try {
//     const { subject } = req.query;
//     let q = 'SELECT p.*, u.name as author_name FROM forum_posts p LEFT JOIN users u ON u.id = p.user_id';
//     const params = [];
//     if (subject) {
//       q += ' WHERE subject_tag = $1';
//       params.push(subject);
//     }
//     q += ' ORDER BY created_at DESC';
//     const r = await pool.query(q, params);
//     res.json({ ok:true, posts: r.rows });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ ok:false });
//   }
// };

export const listPosts = async (req, res) => {
  try {
    const { subject, type_of_upload, grade } = req.query;

    let q = `
      SELECT 
        p.*,
        ff.*,

        -- Use users if available, otherwise admins
        COALESCE(u.id, a.id) AS author_id,
        COALESCE(u.name, a.name) AS author_name,
        u.profile_photo_url,  -- only exists in users
        u.school_name,
        u.grade_level,

        -- fallback to created_at from whichever exists
        COALESCE(u.created_at, a.created_at) AS author_created_at,

        CASE 
          WHEN u.id IS NOT NULL THEN 'user'
          WHEN a.id IS NOT NULL THEN 'admin'
        END AS author_type

      FROM forum_posts p
      LEFT JOIN users u ON u.id = p.user_id
      LEFT JOIN admins a ON a.id = p.admin_id
      LEFT JOIN forum_files ff ON ff.post_id = p.id
    `;

    const conditions = [];
    const params = [];

    if (subject) {
      params.push(subject);
      conditions.push(`p.subject_tag = $${params.length}`);
    }

    if (type_of_upload) {
      params.push(type_of_upload);
      conditions.push(`p.type_of_upload = $${params.length}`);
    }
    if (grade) {
      params.push(grade);
      conditions.push(`p.grade_level = $${params.length}`);
    }
    if (conditions.length > 0) {
      q += ` WHERE ${conditions.join(" AND ")}`;
    }

    q += ` ORDER BY p.created_at DESC`;

    const r = await pool.query(q, params);

    res.json({ ok: true, posts: r.rows });
  } catch (err) {
    console.error("Error fetching posts:", err);
    res.status(500).json({ ok: false });
  }
};


export const createPost = async (req, res) => {
  try {
    const { grade_level, content, subject_tag, type_of_upload, author_type } = req.body;
    const authorId = req.userId; // This could be either user.id or admin.id

    let postRes;

    if (author_type === "user") {
      // Insert with user_id
      postRes = await pool.query(
        `INSERT INTO forum_posts (user_id, grade_level, content, subject_tag, type_of_upload) 
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [authorId, grade_level, content, subject_tag, type_of_upload]
      );
    } else if (author_type === "admin") {
      // Insert with admin_id
      postRes = await pool.query(
        `INSERT INTO forum_posts (admin_id, grade_level, content, subject_tag, type_of_upload) 
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [authorId, grade_level, content, subject_tag, type_of_upload]
      );
    } else {
      return res.status(400).json({ ok: false, message: "Invalid author_type" });
    }

    const post = postRes.rows[0];

    // Handle file uploads if present
    if (req.files && req.files.length) {
      for (const f of req.files) {
        const url = await uploadBufferToVercel(f.buffer, f.originalname);
        await pool.query(
          `INSERT INTO forum_files (post_id, url, filename) VALUES ($1, $2, $3)`,
          [post.id, url, f.originalname]
        );
      }
    }

    res.json({ ok: true, post });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};



// delete froum .........

export const deleteForum = async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ ok: false, message: "Post ID is required" });
    }

    await pool.query(`DELETE FROM forum_files WHERE post_id = $1`, [id]);

    const result = await pool.query(`DELETE FROM forum_posts WHERE id = $1 RETURNING *`, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ ok: false, message: "Forum post not found" });
    }

    res.json({ ok: true, message: "Forum post deleted successfully", deleted: result.rows[0] });
  } catch (error) {
    console.error("Error deleting forum post:", error);
    res.status(500).json({ ok: false, message: "Internal server error" });
  }
};
