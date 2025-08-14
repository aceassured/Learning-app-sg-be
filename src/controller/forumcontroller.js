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
    const { subject } = req.query;
    let q = `
      SELECT 
        p.*, 
        u.id AS user_id,
        u.email,
        u.phone,
        u.name AS author_name,
        u.grade_level,
        u.questions_per_day,
        u.daily_reminder_time,
        u.selected_subjects,
        u.profile_photo_url,
        u.created_at AS user_created_at
      FROM forum_posts p
      LEFT JOIN users u ON u.id = p.user_id
    `;
    
    const params = [];
    if (subject) {
      q += ' WHERE p.subject_tag = $1';
      params.push(subject);
    }
    q += ' ORDER BY p.created_at DESC';
    
    const r = await pool.query(q, params);
    res.json({ ok: true, posts: r.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false });
  }
};


export const createPost = async (req, res) => {
  try {
    const userId = req.userId;
    const { title, content, subject_tag } = req.body;

    const postRes = await pool.query(
      `INSERT INTO forum_posts (user_id, title, content, subject_tag) VALUES ($1,$2,$3,$4) RETURNING *`,
      [userId, title, content, subject_tag]
    );
    const post = postRes.rows[0];

    if (req.files && req.files.length) {
      for (const f of req.files) {
        const url = await uploadBufferToVercel(f.buffer, f.originalname);
        await pool.query(
          `INSERT INTO forum_files (post_id, url, filename) VALUES ($1,$2,$3)`,
          [post.id, url, f.originalname]
        );
      }
    }

    res.json({ ok: true, post });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: 'Server error' });
  }
};
