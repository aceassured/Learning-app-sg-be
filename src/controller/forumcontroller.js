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
    const userId = req.userId; // from auth middleware

    let q = `
      SELECT 
        p.id,
        p.content,
        p.subject_tag,
        p.type_of_upload,
        p.grade_level,
        p.created_at,

        -- Aggregate attached files
        COALESCE(
          JSON_AGG(
            DISTINCT JSONB_BUILD_OBJECT(
              'id', ff.id,
              'url', ff.url,
              'filename', ff.filename
            )
          ) FILTER (WHERE ff.id IS NOT NULL),
          '[]'
        ) AS files,

        -- Aggregate comments
        COALESCE(
          JSON_AGG(
            DISTINCT JSONB_BUILD_OBJECT(
              'id', fc.id,
              'content', fc.content,
              'created_at', fc.created_at,
              'user_id', cu.id,
              'user_name', cu.name,
              'profile_photo_url', cu.profile_photo_url
            )
          ) FILTER (WHERE fc.id IS NOT NULL),
          '[]'
        ) AS comments,

        -- Author details
        COALESCE(u.id, a.id) AS author_id,
        COALESCE(u.name, a.name) AS author_name,
        COALESCE(u.profile_photo_url, a.profile_photo_url) AS profile_photo_url,
        u.school_name,
        u.grade_level AS user_grade_level,
        COALESCE(u.created_at, a.created_at) AS author_created_at,
        CASE 
          WHEN u.id IS NOT NULL THEN 'user'
          WHEN a.id IS NOT NULL THEN 'admin'
        END AS author_type,

        -- Counts
        COALESCE(l.like_count, 0) AS like_count,
        COALESCE(c.comment_count, 0) AS comment_count,

        -- ✅ Did this user like it?
        CASE WHEN ul.user_id IS NOT NULL THEN true ELSE false END AS is_liked_by_user

      FROM forum_posts p
      LEFT JOIN users u ON u.id = p.user_id
      LEFT JOIN admins a ON a.id = p.admin_id
      LEFT JOIN forum_files ff ON ff.post_id = p.id

      -- comments + user info
      LEFT JOIN forum_comments fc ON fc.post_id = p.id
      LEFT JOIN users cu ON cu.id = fc.user_id

      -- join like counts
      LEFT JOIN (
        SELECT post_id, COUNT(*) AS like_count
        FROM forum_likes
        GROUP BY post_id
      ) l ON l.post_id = p.id

      -- join comment counts
      LEFT JOIN (
        SELECT post_id, COUNT(*) AS comment_count
        FROM forum_comments
        GROUP BY post_id
      ) c ON c.post_id = p.id

      -- ✅ join specific user like
      LEFT JOIN forum_likes ul 
        ON ul.post_id = p.id AND ul.user_id = $1
    `;

    const conditions = [];
    const params = [userId]; // first param = userId

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

    q += ` GROUP BY 
             p.id, 
             u.id, a.id, 
             l.like_count, 
             c.comment_count, 
             ul.user_id
           ORDER BY p.created_at DESC`;

    const r = await pool.query(q, params);

    res.json({ ok: true, posts: r.rows });
  } catch (err) {
    console.error("Error fetching posts:", err);
    res.status(500).json({ ok: false });
  }
};


// get only particular forum notes.......

export const getonlyForumNotes = async (req, res) => {
  try {
    const { id } = req.body; // id = forum post id

    if (!id) {
      return res.status(400).json({ ok: false, error: "Post ID is required" });
    }

    const q = `
      SELECT 
        p.id,
        p.content,
        p.subject_tag,
        p.type_of_upload,
        p.grade_level,
        p.created_at,

        -- Aggregate attached files
        COALESCE(
          JSON_AGG(
            DISTINCT JSONB_BUILD_OBJECT(
              'id', ff.id,
              'url', ff.url,
              'filename', ff.filename
            )
          ) FILTER (WHERE ff.id IS NOT NULL),
          '[]'
        ) AS files,

        -- Aggregate comments
        COALESCE(
          JSON_AGG(
            DISTINCT JSONB_BUILD_OBJECT(
              'id', fc.id,
              'content', fc.content,
              'created_at', fc.created_at,
              'user_id', cu.id,
              'user_name', cu.name,
              'profile_photo_url', cu.profile_photo_url
            )
          ) FILTER (WHERE fc.id IS NOT NULL),
          '[]'
        ) AS comments,

        -- Author details
        COALESCE(u.id, a.id) AS author_id,
        COALESCE(u.name, a.name) AS author_name,
        COALESCE(u.profile_photo_url, a.profile_photo_url) AS profile_photo_url,
        u.school_name,
        u.grade_level AS user_grade_level,
        COALESCE(u.created_at, a.created_at) AS author_created_at,
        CASE 
          WHEN u.id IS NOT NULL THEN 'user'
          WHEN a.id IS NOT NULL THEN 'admin'
        END AS author_type,

        -- Counts
        COALESCE(l.like_count, 0) AS like_count,
        COALESCE(c.comment_count, 0) AS comment_count

      FROM forum_posts p
      LEFT JOIN users u ON u.id = p.user_id
      LEFT JOIN admins a ON a.id = p.admin_id
      LEFT JOIN forum_files ff ON ff.post_id = p.id
      LEFT JOIN forum_comments fc ON fc.post_id = p.id
      LEFT JOIN users cu ON cu.id = fc.user_id
      LEFT JOIN (
        SELECT post_id, COUNT(*) AS like_count
        FROM forum_likes
        GROUP BY post_id
      ) l ON l.post_id = p.id
      LEFT JOIN (
        SELECT post_id, COUNT(*) AS comment_count
        FROM forum_comments
        GROUP BY post_id
      ) c ON c.post_id = p.id
      WHERE p.id = $1
      GROUP BY 
        p.id, 
        u.id, a.id, 
        l.like_count, 
        c.comment_count
    `;

    const r = await pool.query(q, [id]);

    if (r.rows.length === 0) {
      return res.status(404).json({ ok: false, error: "Post not found" });
    }

    res.json({ ok: true, post: r.rows[0] });
  } catch (err) {
    console.error("Error fetching post:", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
};


export const createPost = async (req, res) => {
  try {
    const { grade_level, content, subject_tag, type_of_upload, author_type } = req.body;
    const authorId = req.userId;

    let postRes;

    const getGradequerry = `SELECT grade_level FROM grades WHERE id = $1`
    const gradeResult = await pool.query(getGradequerry, [grade_level])
    const gradeValue = gradeResult.rows[0].grade_level
console.log(gradeValue)
    const getSubjectquerry = `SELECT subject FROM subjects WHERE id = $1`
    const subjectResult = await pool.query(getSubjectquerry, [subject_tag])
    const subjectValue = subjectResult.rows[0].subject

    if (author_type === "user") {
      postRes = await pool.query(
        `INSERT INTO forum_posts (user_id, grade_level, content, subject_tag, type_of_upload) 
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [authorId, gradeValue, content, subjectValue, type_of_upload]
      );
    } else if (author_type === "admin") {
      postRes = await pool.query(
        `INSERT INTO forum_posts (admin_id, grade_level, content, subject_tag, type_of_upload) 
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [authorId, gradeValue, content, subjectValue, type_of_upload]
      );
    } else {
      return res.status(400).json({ ok: false, message: "Invalid author_type" });
    }

    const post = postRes.rows[0];

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


// delete user...........

export const deleteUser = async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ ok: false, message: "User ID is required" });
    }

    const result = await pool.query(`DELETE FROM users WHERE id = $1 RETURNING *`, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ ok: false, message: "Users post not found" });
    }

    res.json({ ok: true, message: "User deleted successfully", deleted: result.rows[0] });
  } catch (error) {
    console.error("Error deleting Users post:", error);
    res.status(500).json({ ok: false, message: "Internal server error" });
  }
};

// ✅ Add Like

export const addLike = async (req, res) => {
  try {
    const { postId } = req.body;
    const userId = req.userId;

    if (!postId || !userId) {
      return res
        .status(400)
        .json({ success: false, message: "postId and userId are required" });
    }

    // Try to insert like → duplicates will throw error
    const result = await pool.query(
      `INSERT INTO forum_likes (post_id, user_id)
       VALUES ($1, $2)
       RETURNING *`,
      [postId, userId]
    );

    return res.status(201).json({
      success: true,
      message: "Post liked successfully",
      data: result.rows[0],
    });
  } catch (error) {
    if (error.code === "23505") {
      // Unique violation → already liked
      return res
        .status(409)
        .json({ success: false, message: "You already liked this post" });
    }

    console.error("❌ addLike error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};


// ✅ Remove Like
export const removeLike = async (req, res) => {
  try {
    const { postId } = req.body;
    const userId = req.userId;

    if (!postId || !userId) {
      return res.status(400).json({ success: false, message: "postId and userId are required" });
    }

    await pool.query(`DELETE FROM forum_likes WHERE post_id=$1 AND user_id=$2`, [postId, userId]);

    return res.status(200).json({ success: true, message: "Like removed successfully" });
  } catch (error) {
    console.error("❌ removeLike error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ✅ Add Comment
export const addComment = async (req, res) => {
  try {
    const userId = req.userId
    const { postId, content } = req.body;

    if (!postId || !userId || !content) {
      return res.status(400).json({ success: false, message: "postId, userId, and content are required" });
    }

    const { rows } = await pool.query(
      `INSERT INTO forum_comments (post_id, user_id, content)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [postId, userId, content]
    );

    return res.status(201).json({ success: true, message: "Comment added", comment: rows[0] });
  } catch (error) {
    console.error("❌ addComment error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ✅ Delete Comment
export const deleteComment = async (req, res) => {
  try {
    const { commentId } = req.body;
    const userId = req.userId;

    if (!commentId || !userId) {
      return res.status(400).json({ success: false, message: "commentId and userId are required" });
    }

    // ensure only owner can delete
    const { rowCount } = await pool.query(
      `DELETE FROM forum_comments WHERE id=$1 AND user_id=$2`,
      [commentId, userId]
    );

    if (rowCount === 0) {
      return res.status(403).json({ success: false, message: "Not authorized or comment not found" });
    }

    return res.status(200).json({ success: true, message: "Comment deleted successfully" });
  } catch (error) {
    console.error("❌ deleteComment error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const getAlllikesandComments = async (req, res) => {
  try {
    const { postId } = req.body;

    if (!postId) {
      return res.status(400).json({ success: false, message: "postId is required" });
    }

    // ✅ Get likes with user details
    const { rows: likeRows } = await pool.query(
      `SELECT 
         l.id, 
         l.user_id, 
         u.name AS user_name, 
         u.profile_photo_url, 
         l.created_at
       FROM forum_likes l
       JOIN users u ON l.user_id = u.id
       WHERE l.post_id = $1
       ORDER BY l.created_at ASC`,
      [postId]
    );

    // ✅ Get comments with user details
    const { rows: commentRows } = await pool.query(
      `SELECT 
         c.id, 
         c.content, 
         c.user_id,
         u.name AS user_name, 
         u.profile_photo_url,
         c.created_at
       FROM forum_comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.post_id = $1
       ORDER BY c.created_at ASC`,
      [postId]
    );

    return res.status(200).json({
      success: true,
      data: {
        likes: likeRows,     // array of who liked
        comments: commentRows, // array of who commented
      },
    });
  } catch (error) {
    console.error("❌ getAlllikesandComments error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};
