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
    const { id, subjectId, gradeId, type_of_upload } = req.query;
    const userId = req.userId; // from auth middleware

    let q = `
      SELECT 
        p.id,
        p.content,
        s.subject AS subject_tag,     -- ✅ join subject name
        g.grade_level AS grade_level,       -- ✅ join grade name
        p.type_of_upload,
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

      -- ✅ join subjects & grades
      LEFT JOIN subjects s ON s.id = p.subject_tag
      LEFT JOIN grades g ON g.id = p.grade_level
    `;

    const conditions = [];
    const params = [userId]; // first param = userId

    if (id) {
      params.push(id);
      conditions.push(`p.id = $${params.length}`);
    }

    if (subjectId) {
      params.push(subjectId);
      conditions.push(`p.subject_tag = $${params.length}`);
    }

    if (gradeId) {
      params.push(gradeId);
      conditions.push(`p.grade_level = $${params.length}`);
    }

    if (type_of_upload) {
      params.push(type_of_upload);
      conditions.push(`p.type_of_upload = $${params.length}`);
    }

    if (conditions.length > 0) {
      q += ` WHERE ${conditions.join(" AND ")}`;
    }

    q += ` GROUP BY 
             p.id, 
             s.subject, g.grade_level,   -- ✅ must group by joined columns
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

export const savedForumAndPolls = async (req, res) => {
  try {
    const userId = req.userId; // from auth middleware
    const search = req.body?.search || null;

    if (!userId) {
      return res.status(400).json({ ok: false, error: "User ID is required" });
    }

    const params = [userId];
    let forumSearchCondition = "";
    let pollSearchCondition = "";

    if (search) {
      params.push(`%${search}%`);
      forumSearchCondition = `AND f.forum_title ILIKE $${params.length}`;
      pollSearchCondition = `AND p.question ILIKE $${params.length}`;
    }

    const q = `
      -- ✅ Fetch saved forums
      SELECT 
        'forum' AS data_type,
        f.id,
        f.content,
        f.forum_title,
        f.subject_tag,
        f.grade_level,
        f.created_at,
        COALESCE(fvc.view_count, 0) AS view_count,
        COALESCE(fl.like_count, 0) AS like_count,
        COALESCE(ff.files, '[]') AS files,
        COALESCE(u.name, a.name) AS author_name,
        CASE 
          WHEN u.id IS NOT NULL THEN 'user'
          WHEN a.id IS NOT NULL THEN 'admin'
        END AS author_type,
        false AS has_voted,
        NULL AS user_selected_option
      FROM user_saved_forums usf
      JOIN forum_posts f ON f.id = usf.forum_post_id
      LEFT JOIN (
        SELECT forum_post_id, COUNT(*) AS view_count
        FROM forum_views
        GROUP BY forum_post_id
      ) fvc ON fvc.forum_post_id = f.id
      LEFT JOIN (
        SELECT post_id, COUNT(*) AS like_count
        FROM forum_likes
        GROUP BY post_id
      ) fl ON fl.post_id = f.id
      LEFT JOIN (
        SELECT post_id,
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', id,
              'url', url,
              'filename', filename
            )
          ) AS files
        FROM forum_files
        GROUP BY post_id
      ) ff ON ff.post_id = f.id
      LEFT JOIN users u ON u.id = f.user_id
      LEFT JOIN admins a ON a.id = f.admin_id
      WHERE usf.user_id = $1
      ${forumSearchCondition}

      UNION ALL

      -- ✅ Fetch saved polls
      SELECT
        'poll' AS data_type,
        p.id,
        p.question AS content,
        NULL AS forum_title,
        p.subject_id AS subject_tag,
        p.grade_level,
        p.created_at,
        COALESCE(pv.view_count, 0) AS view_count,
        COALESCE(pvc.vote_count, 0) AS like_count, -- treat votes as "likes"
        COALESCE(po.options, '[]') AS files,
        NULL AS author_name,
        NULL AS author_type,
        CASE WHEN uv.user_id IS NOT NULL THEN true ELSE false END AS has_voted,
        uv.option_id AS user_selected_option
      FROM user_saved_polls usp
      JOIN polls p ON p.id = usp.poll_id
      LEFT JOIN (
        SELECT poll_id, COUNT(*) AS view_count
        FROM poll_views
        GROUP BY poll_id
      ) pv ON pv.poll_id = p.id
      LEFT JOIN (
        SELECT poll_id, COUNT(*) AS vote_count
        FROM poll_votes
        GROUP BY poll_id
      ) pvc ON pvc.poll_id = p.id
      LEFT JOIN (
        SELECT poll_id,
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', id,
              'option_text', option_text,
              'vote_count', (SELECT COUNT(*) FROM poll_votes WHERE poll_votes.option_id = poll_options.id)
            )
          ) AS options
        FROM poll_options
        GROUP BY poll_id
      ) po ON po.poll_id = p.id
      LEFT JOIN (
        SELECT poll_id, option_id, user_id
        FROM poll_votes
        WHERE user_id = $1
      ) uv ON uv.poll_id = p.id
      WHERE usp.user_id = $1
      ${pollSearchCondition}

      ORDER BY created_at DESC
    `;

    const r = await pool.query(q, params);

    res.json({ ok: true, saved_items: r.rows });
  } catch (error) {
    console.error("Error fetching saved forums and polls:", error);
    res.status(500).json({ ok: false, error: "Server error" });
  }
};





// get only particular forum notes.......

export const getonlyForumNotes = async (req, res) => {
  try {
    const userId = req.userId; // from JWT middleware
    const { id } = req.body; // forum_post_id or poll_id

    if (!id) {
      return res.status(400).json({ ok: false, error: "ID is required" });
    }

    // =====================
    // 1) Try Forum First
    // =====================
    const forumQuery = `
      SELECT 
        p.id,
        p.forum_title AS forum_title,
        p.content,
        s.subject,
        g.grade_level,
        p.type_of_upload,
        p.created_at,

        -- ✅ Add topic info
        p.topic_id,
        t.topic AS topic_name,

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

        COALESCE(l.like_count, 0) AS like_count,
        COALESCE(c.comment_count, 0) AS comment_count,
        COALESCE(v.view_count, 0) AS view_count,

        CASE WHEN usf.id IS NOT NULL THEN true ELSE false END AS is_forum_saved

      FROM forum_posts p
      LEFT JOIN users u ON u.id = p.user_id
      LEFT JOIN admins a ON a.id = p.admin_id
      LEFT JOIN forum_files ff ON ff.post_id = p.id
      LEFT JOIN forum_comments fc ON fc.post_id = p.id
      LEFT JOIN users cu ON cu.id = fc.user_id
      LEFT JOIN subjects s ON s.id = p.subject_tag
      LEFT JOIN grades g ON g.id = p.grade_level
      LEFT JOIN topics t ON t.id = p.topic_id   -- ✅ join topics

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

      LEFT JOIN (
        SELECT forum_post_id, COUNT(*) AS view_count
        FROM forum_views
        GROUP BY forum_post_id
      ) v ON v.forum_post_id = p.id

      LEFT JOIN user_saved_forums usf 
        ON usf.forum_post_id = p.id AND usf.user_id = $2

      WHERE p.id = $1
      GROUP BY 
        p.id, s.subject, g.grade_level, t.topic, p.topic_id,
        u.id, a.id, 
        l.like_count, 
        c.comment_count, 
        v.view_count, usf.id
    `;

    const forumRes = await pool.query(forumQuery, [id, userId]);

    if (forumRes.rows.length > 0) {
      return res.json({
        ok: true,
        data_type: "forum",
        data: forumRes.rows[0],
      });
    }

    // =====================
    // 2) Try Poll
    // =====================
    const pollRes = await pool.query(
      `SELECT 
         p.id,
         p.question AS poll_title,
         p.created_at,
         COALESCE(v.view_count, 0) AS view_count,
         CASE WHEN usp.id IS NOT NULL THEN true ELSE false END AS is_poll_saved
       FROM polls p
       LEFT JOIN (
         SELECT poll_id, COUNT(*) AS view_count
         FROM poll_views
         GROUP BY poll_id
       ) v ON v.poll_id = p.id
       LEFT JOIN user_saved_polls usp 
         ON usp.poll_id = p.id AND usp.user_id = $2
       WHERE p.id = $1`,
      [id, userId]
    );

    if (pollRes.rows.length === 0) {
      return res.status(404).json({ ok: false, error: "No forum or poll found" });
    }

    // Fetch poll options with votes
    const optionsRes = await pool.query(
      `SELECT 
         po.id, 
         po.option_text,
         COALESCE(COUNT(pv.id), 0) AS vote_count
       FROM poll_options po
       LEFT JOIN poll_votes pv ON po.id = pv.option_id
       WHERE po.poll_id = $1
       GROUP BY po.id, po.option_text
       ORDER BY po.id`,
      [id]
    );

    // Check if current user voted
    const voteRes = await pool.query(
      `SELECT option_id 
       FROM poll_votes 
       WHERE poll_id = $1 AND user_id = $2
       LIMIT 1`,
      [id, userId]
    );

    const hasVoted = voteRes.rows.length > 0;
    const userSelectedOption = hasVoted ? voteRes.rows[0].option_id : null;

    const pollData = {
      ...pollRes.rows[0],
      options: optionsRes.rows.map((o) => ({
        ...o,
        vote_count: Number(o.vote_count),
      })),
      has_voted: hasVoted,
      user_selected_option: userSelectedOption,
    };

    return res.json({
      ok: true,
      data_type: "poll",
      data: pollData,
    });

  } catch (err) {
    console.error("getForumOrPollById error:", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
};




export const createPost = async (req, res) => {
  try {
    const { grade_level, content, subject_tag, type_of_upload, author_type, forum_title, topic_id } = req.body;
    const authorId = req.userId;

    let postRes;
    // Force UTC timestamp
    const created_at = new Date().toISOString();

    if (author_type === "user") {
      postRes = await pool.query(
        `INSERT INTO forum_posts (user_id, grade_level, content, subject_tag, type_of_upload, forum_title, topic_id, created_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [authorId, grade_level, content, subject_tag, type_of_upload, forum_title, topic_id, created_at]
      );
    } else if (author_type === "admin") {
      postRes = await pool.query(
        `INSERT INTO forum_posts (admin_id, grade_level, content, subject_tag, type_of_upload, forum_title, topic_id, created_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [authorId, grade_level, content, subject_tag, type_of_upload, forum_title, topic_id, created_at]
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


export const editPost = async (req, res) => {
  try {
    const authorId = req.userId;
    const {
      post_id,
      grade_level,
      content,
      subject_tag,
      type_of_upload,
      forum_title,
      topic_id,
      author_type,
    } = req.body;

    if (!post_id || !author_type) {
      return res.status(400).json({ ok: false, message: "post_id and author_type are required" });
    }

    let query;
    if (author_type === "user") {
      query = {
        text: `UPDATE forum_posts
               SET grade_level = $1,
                   content = $2,
                   subject_tag = $3,
                   type_of_upload = $4,
                   forum_title = $5,
                   topic_id = $6
               WHERE id = $7 AND user_id = $8
               RETURNING *`,
        values: [
          grade_level,
          content,
          subject_tag,
          type_of_upload,
          forum_title,
          topic_id,
          post_id,
          authorId,
        ],
      };
    } else if (author_type === "admin") {
      query = {
        text: `UPDATE forum_posts
               SET grade_level = $1,
                   content = $2,
                   subject_tag = $3,
                   type_of_upload = $4,
                   forum_title = $5,
                   topic_id = $6
               WHERE id = $7 AND admin_id = $8
               RETURNING *`,
        values: [
          grade_level,
          content,
          subject_tag,
          type_of_upload,
          forum_title,
          topic_id,
          post_id,
          authorId,
        ],
      };
    } else {
      return res.status(400).json({ ok: false, message: "Invalid author_type" });
    }

    const postRes = await pool.query(query);
    if (postRes.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        message: "Post not found or you are not authorized to edit this post",
      });
    }

    const post = postRes.rows[0];

    // ✅ Handle file updates (optional: delete old files if needed)
    if (req.files && req.files.length) {
      // First, delete old files if you want to fully replace them
      await pool.query(`DELETE FROM forum_files WHERE post_id = $1`, [post.id]);

      for (const f of req.files) {
        const url = await uploadBufferToVercel(f.buffer, f.originalname);
        await pool.query(
          `INSERT INTO forum_files (post_id, url, filename) VALUES ($1, $2, $3)`,
          [post.id, url, f.originalname]
        );
      }
    }

    res.json({ ok: true, message: "Post updated successfully", post });
  } catch (err) {
    console.error("❌ editPost error:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};


// delete froum .........

export const deleteForum = async (req, res) => {
  try {
    const { post_id } = req.body;

    if (!post_id) {
      return res.status(400).json({ ok: false, message: "Post ID is required" });
    }

    await pool.query(`DELETE FROM forum_files WHERE post_id = $1`, [post_id]);

    const result = await pool.query(`DELETE FROM forum_posts WHERE id = $1 RETURNING *`, [post_id]);

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
    const { id, data_type } = req.body;
    // id = forum_post_id or poll_id depending on data_type
    const userId = req.userId;

    if (!id || !userId || !data_type) {
      return res.status(400).json({
        success: false,
        message: "id, userId, and data_type are required",
      });
    }

    let query;
    if (data_type === "forum") {
      query = {
        text: `INSERT INTO forum_likes (post_id, user_id)
               VALUES ($1, $2)
               RETURNING *`,
        values: [id, userId],
      };
    } else if (data_type === "poll") {
      query = {
        text: `INSERT INTO poll_likes (poll_id, user_id)
               VALUES ($1, $2)
               RETURNING *`,
        values: [id, userId],
      };
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid data_type. Must be 'forum' or 'poll'",
      });
    }

    const result = await pool.query(query);

    return res.status(201).json({
      success: true,
      message: `${data_type} liked successfully`,
      data: result.rows[0],
      data_type,
    });
  } catch (error) {
    if (error.code === "23505") {
      // Unique violation → already liked
      return res.status(409).json({
        success: false,
        message: `You already liked this ${req.body.data_type}`,
      });
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
    const { id, data_type } = req.body;
    // id = forum_post_id or poll_id depending on data_type
    const userId = req.userId;

    if (!id || !userId || !data_type) {
      return res.status(400).json({
        success: false,
        message: "id, userId, and data_type are required",
      });
    }

    let query;
    if (data_type === "forum") {
      query = {
        text: `DELETE FROM forum_likes WHERE post_id=$1 AND user_id=$2`,
        values: [id, userId],
      };
    } else if (data_type === "poll") {
      query = {
        text: `DELETE FROM poll_likes WHERE poll_id=$1 AND user_id=$2`,
        values: [id, userId],
      };
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid data_type. Must be 'forum' or 'poll'",
      });
    }

    const result = await pool.query(query);

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: `Like not found for this ${data_type}`,
      });
    }

    return res.status(200).json({
      success: true,
      message: `${data_type} like removed successfully`,
      data_type,
    });
  } catch (error) {
    console.error("❌ removeLike error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};


// ✅ Add Comment
export const addComment = async (req, res) => {
  try {
    const userId = req.userId;
    const { id, content, data_type } = req.body;
    // id = forum_post_id or poll_id depending on data_type

    if (!id || !userId || !content || !data_type) {
      return res.status(400).json({
        success: false,
        message: "id, userId, content, and data_type are required"
      });
    }

    let query;
    if (data_type === "forum") {
      query = {
        text: `INSERT INTO forum_comments (post_id, user_id, content)
               VALUES ($1, $2, $3)
               RETURNING *`,
        values: [id, userId, content]
      };
    } else if (data_type === "poll") {
      query = {
        text: `INSERT INTO poll_comments (poll_id, user_id, comment)
               VALUES ($1, $2, $3)
               RETURNING *`,
        values: [id, userId, content]
      };
    } else {
      return res.status(400).json({ success: false, message: "Invalid data_type. Must be 'forum' or 'poll'" });
    }

    const { rows } = await pool.query(query);

    return res.status(201).json({
      success: true,
      message: "Comment added successfully",
      comment: rows[0],
      data_type
    });

  } catch (error) {
    console.error("❌ addComment error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};


export const editComment = async (req, res) => {
  try {
    const userId = req.userId;
    const { comment_id, content, data_type } = req.body;

    if (!comment_id || !content || !data_type) {
      return res.status(400).json({
        success: false,
        message: "comment_id, content, and data_type are required",
      });
    }

    let query;
    if (data_type === "forum") {
      query = {
        text: `UPDATE forum_comments
               SET content = $1
               WHERE id = $2 AND user_id = $3
               RETURNING *`,
        values: [content, comment_id, userId],
      };
    } else if (data_type === "poll") {
      query = {
        text: `UPDATE poll_comments
               SET comment = $1
               WHERE id = $2 AND user_id = $3
               RETURNING *`,
        values: [content, comment_id, userId],
      };
    } else {
      return res
        .status(400)
        .json({ success: false, message: "Invalid data_type. Must be 'forum' or 'poll'" });
    }

    const { rows } = await pool.query(query);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Comment not found or you are not authorized to edit this comment",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Comment updated successfully",
      comment: rows[0],
      data_type,
    });
  } catch (error) {
    console.error("❌ editComment error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};


// ✅ Delete Comment
export const deleteComment = async (req, res) => {
  try {
    const { commentId, data_type } = req.body; // Add data_type here
    const userId = req.userId;
    console.log("userId:", userId);
    console.log("commentId:", commentId);
    console.log("data_type:", data_type);

    if (!commentId || !userId) {
      return res.status(400).json({ 
        success: false, 
        message: "commentId and userId are required" 
      });
    }

    // Determine which table to use based on data_type
    const tableName = data_type === "poll" ? "poll_comments" : "forum_comments";
    
    console.log("Deleting from table:", tableName);

    // Check if comment exists and belongs to user
    const topicCheckQuery = `SELECT * FROM ${tableName} WHERE id=$1 AND user_id=$2`;
    const topicCheck = await pool.query(topicCheckQuery, [commentId, userId]);
    console.log("topicCheck:", topicCheck.rows[0]);

    if (topicCheck.rowCount === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Comment not found or you don't have permission to delete it" 
      });
    }

    // Delete from the same table
    const deleteQuery = `DELETE FROM ${tableName} WHERE id=$1 AND user_id=$2`;
    const { rowCount } = await pool.query(deleteQuery, [commentId, userId]);
    
    console.log("Deleted rows:", rowCount);

    if (rowCount === 0) {
      return res.status(403).json({ 
        success: false, 
        message: "Not authorized or comment not found" 
      });
    }

    return res.status(200).json({ 
      success: true, 
      message: "Comment deleted successfully" 
    });
  } catch (error) {
    console.error("❌ deleteComment error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Internal server error" 
    });
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


// save forum......


export const saveForumOrPoll = async (req, res) => {
  try {
    const userId = req.userId;
    const { type, id } = req.body;
    // type = "forum" | "poll"
    // id   = forum_post_id OR poll_id

    if (!type || !id) {
      return res.status(400).json({ ok: false, message: "type and id are required" });
    }

    if (type === "forum") {
      // ✅ Check if forum exists
      const { rows } = await pool.query(
        "SELECT id FROM forum_posts WHERE id=$1",
        [id]
      );
      if (!rows.length) {
        return res.status(404).json({ ok: false, message: "Forum not found" });
      }

      // ✅ Check if already saved
      const check = await pool.query(
        "SELECT id FROM user_saved_forums WHERE user_id=$1 AND forum_post_id=$2",
        [userId, id]
      );

      if (check.rows.length) {
        await pool.query(
          "DELETE FROM user_saved_forums WHERE user_id=$1 AND forum_post_id=$2",
          [userId, id]
        );
        return res.json({ ok: true, saved: false, type: "forum", message: "Forum unsaved" });
      } else {
        await pool.query(
          "INSERT INTO user_saved_forums (user_id, forum_post_id) VALUES ($1,$2)",
          [userId, id]
        );
        return res.json({ ok: true, saved: true, type: "forum", message: "Forum saved" });
      }
    }

    else if (type === "poll") {
      // ✅ Check if poll exists
      const { rows } = await pool.query(
        "SELECT id FROM polls WHERE id=$1",
        [id]
      );
      if (!rows.length) {
        return res.status(404).json({ ok: false, message: "Poll not found" });
      }

      // ✅ Check if already saved
      const check = await pool.query(
        "SELECT id FROM user_saved_polls WHERE user_id=$1 AND poll_id=$2",
        [userId, id]
      );

      if (check.rows.length) {
        await pool.query(
          "DELETE FROM user_saved_polls WHERE user_id=$1 AND poll_id=$2",
          [userId, id]
        );
        return res.json({ ok: true, saved: false, type: "poll", message: "Poll unsaved" });
      } else {
        await pool.query(
          "INSERT INTO user_saved_polls (user_id, poll_id) VALUES ($1,$2)",
          [userId, id]
        );
        return res.json({ ok: true, saved: true, type: "poll", message: "Poll saved" });
      }
    }

    else {
      return res.status(400).json({ ok: false, message: "Invalid type. Use 'forum' or 'poll'." });
    }

  } catch (error) {
    console.error("saveForumOrPoll error:", error);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
};



// get forum and polls data.......

// export const getForumAndPollFeed = async (req, res) => {
//   try {
//     const userId = req.userId;
//     const { subject, search, sortBy } = req.query;

//     // =======================
//     // 1) Fetch Forums
//     // =======================
//     let forumQuery = `
//       SELECT 
//         p.id,
//         p.content,
//         s.subject AS subject_tag,     
//         g.grade_level AS grade_level,       
//         p.type_of_upload,
//         p.created_at,
//         p.forum_title AS forum_title,

//         COALESCE(
//           JSON_AGG(
//             DISTINCT JSONB_BUILD_OBJECT(
//               'id', ff.id,
//               'url', ff.url,
//               'filename', ff.filename
//             )
//           ) FILTER (WHERE ff.id IS NOT NULL),
//           '[]'
//         ) AS files,

//         COALESCE(
//           JSON_AGG(
//             DISTINCT JSONB_BUILD_OBJECT(
//               'id', fc.id,
//               'content', fc.content,
//               'created_at', fc.created_at,
//               'user_id', cu.id,
//               'user_name', cu.name,
//               'profile_photo_url', cu.profile_photo_url
//             )
//           ) FILTER (WHERE fc.id IS NOT NULL),
//           '[]'
//         ) AS comments,

//         COALESCE(u.id, a.id) AS author_id,
//         COALESCE(u.name, a.name) AS author_name,
//         COALESCE(u.profile_photo_url, a.profile_photo_url) AS profile_photo_url,
//         u.school_name,
//         u.grade_level AS user_grade_level,
//         COALESCE(u.created_at, a.created_at) AS author_created_at,
//         CASE 
//           WHEN u.id IS NOT NULL THEN 'user'
//           WHEN a.id IS NOT NULL THEN 'admin'
//         END AS author_type,

//         COALESCE(l.like_count, 0) AS like_count,
//         COALESCE(c.comment_count, 0) AS comment_count,
//         CASE WHEN ul.user_id IS NOT NULL THEN true ELSE false END AS is_liked_by_user,
//         CASE WHEN sf.user_id IS NOT NULL THEN true ELSE false END AS is_forum_saved,

//         COALESCE(v.view_count, 0) AS view_count

//       FROM forum_posts p
//       LEFT JOIN users u ON u.id = p.user_id
//       LEFT JOIN admins a ON a.id = p.admin_id
//       LEFT JOIN forum_files ff ON ff.post_id = p.id
//       LEFT JOIN forum_comments fc ON fc.post_id = p.id
//       LEFT JOIN users cu ON cu.id = fc.user_id

//       LEFT JOIN (
//         SELECT post_id, COUNT(*) AS like_count
//         FROM forum_likes
//         GROUP BY post_id
//       ) l ON l.post_id = p.id

//       LEFT JOIN (
//         SELECT post_id, COUNT(*) AS comment_count
//         FROM forum_comments
//         GROUP BY post_id
//       ) c ON c.post_id = p.id

//       LEFT JOIN forum_likes ul 
//         ON ul.post_id = p.id AND ul.user_id = $1

//       LEFT JOIN subjects s ON s.id = p.subject_tag
//       LEFT JOIN grades g ON g.id = p.grade_level

//       LEFT JOIN user_saved_forums sf 
//         ON sf.forum_post_id = p.id AND sf.user_id = $1

//       LEFT JOIN (
//         SELECT forum_post_id, COUNT(*) AS view_count
//         FROM forum_views
//         GROUP BY forum_post_id
//       ) v ON v.forum_post_id = p.id
//     `;

//     const conditions = [];
//     const params = [userId];

//     if (subject) {
//       params.push(subject);
//       conditions.push(`p.subject_tag = $${params.length}`);
//     }
//     if (search) {
//       params.push(`%${search}%`);
//       conditions.push(`p.forum_title ILIKE $${params.length}`);
//     }

//     if (conditions.length > 0) {
//       forumQuery += ` WHERE ${conditions.join(" AND ")}`;
//     }

//     forumQuery += ` GROUP BY 
//       p.id, s.subject, g.grade_level,
//       u.id, a.id, l.like_count, c.comment_count, ul.user_id, sf.user_id, v.view_count
//     `;

//     const forumRes = await pool.query(forumQuery, params);
//     const forums = forumRes.rows.map(f => ({
//       ...f,
//       data_type: "forum"
//     }));

//     // =======================
//     // 2) Fetch Polls
//     // =======================
// // =======================
// // 2) Fetch Polls
// // =======================
// let pollQuery = `
// SELECT 
//   p.id,
//   p.question AS poll_title,
//   p.created_at,
//   p.expires_at,
//   p.subject_id,
//   p.grade_level,

//   COALESCE(v.view_count, 0) AS view_count,

//   CASE WHEN uv.user_id IS NOT NULL THEN true ELSE false END AS has_voted,
//   uv.option_id AS user_selected_option,

//   CASE WHEN usp.user_id IS NOT NULL THEN true ELSE false END AS is_poll_saved,

//   COALESCE(l.like_count, 0) AS like_count,
//   COALESCE(c.comment_count, 0) AS comment_count,
//   CASE WHEN ul.user_id IS NOT NULL THEN true ELSE false END AS is_liked_by_user,

//   COALESCE(
//     JSON_AGG(
//       DISTINCT JSONB_BUILD_OBJECT(
//         'id', pc.id,
//         'comment', pc.comment,   -- ✅ fixed
//         'created_at', pc.created_at,
//         'user_id', cu.id,
//         'user_name', cu.name,
//         'profile_photo_url', cu.profile_photo_url
//       )
//     ) FILTER (WHERE pc.id IS NOT NULL),
//     '[]'
//   ) AS comments,

//   COALESCE(
//     JSON_AGG(
//       DISTINCT JSONB_BUILD_OBJECT(
//         'id', po.id,
//         'option_text', po.option_text,
//         'vote_count', COALESCE(pvc.vote_count, 0),
//         'voters', COALESCE(pvc.voters, '[]')
//       )
//     ) FILTER (WHERE po.id IS NOT NULL),
//     '[]'
//   ) AS options

// FROM polls p
// LEFT JOIN (
//   SELECT poll_id, COUNT(*) AS view_count
//   FROM poll_views
//   GROUP BY poll_id
// ) v ON v.poll_id = p.id

// LEFT JOIN poll_options po ON po.poll_id = p.id
// LEFT JOIN (
//   SELECT 
//     pv.option_id,
//     COUNT(pv.id) AS vote_count,
//     json_agg(json_build_object('id', u.id, 'name', u.name)) AS voters
//   FROM poll_votes pv
//   LEFT JOIN users u ON u.id = pv.user_id
//   GROUP BY pv.option_id
// ) pvc ON pvc.option_id = po.id

// LEFT JOIN (
//   SELECT pv.poll_id, pv.option_id, pv.user_id
//   FROM poll_votes pv
//   WHERE pv.user_id = $2
// ) uv ON uv.poll_id = p.id

// LEFT JOIN user_saved_polls usp
//   ON usp.poll_id = p.id AND usp.user_id = $2

// LEFT JOIN (
//   SELECT poll_id, COUNT(*) AS like_count
//   FROM poll_likes
//   GROUP BY poll_id
// ) l ON l.poll_id = p.id

// LEFT JOIN poll_likes ul 
//   ON ul.poll_id = p.id AND ul.user_id = $2

// LEFT JOIN (
//   SELECT poll_id, COUNT(*) AS comment_count
//   FROM poll_comments
//   GROUP BY poll_id
// ) c ON c.poll_id = p.id

// LEFT JOIN poll_comments pc ON pc.poll_id = p.id
// LEFT JOIN users cu ON cu.id = pc.user_id

// WHERE (p.expires_at IS NULL OR p.expires_at > $1)
// `;

// // ✅ keep params array
// const pollParams = [new Date(), userId];
// if (subject) {
//   pollParams.push(subject);
//   pollQuery += ` AND p.subject_id = $${pollParams.length}`;
// }
// if (search) {
//   pollParams.push(`%${search}%`);
//   pollQuery += ` AND p.question ILIKE $${pollParams.length}`;
// }

// pollQuery += `
// GROUP BY p.id, v.view_count, uv.user_id, uv.option_id, usp.user_id, l.like_count, c.comment_count, ul.user_id
// `;

// const pollRes = await pool.query(pollQuery, pollParams);
// const polls = pollRes.rows.map(p => ({
//   ...p,
//   data_type: "poll",
//   has_voted: p.has_voted || false,
//   user_selected_option: p.user_selected_option || null
// }));


//     // =======================
//     // 3) Merge + Sort
//     // =======================
//     let feed = [...forums, ...polls];

//     if (sortBy === "most_recent") {
//       feed.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
//     } else if (sortBy === "most_old") {
//       feed.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
//     } else if (sortBy === "most_view") {
//       feed.sort((a, b) => Number(b.view_count) - Number(a.view_count));
//     } else {
//       feed.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
//     }

//     return res.json({ ok: true, data: feed });
//   } catch (err) {
//     console.error("getForumAndPollFeed error:", err);
//     return res.status(500).json({ ok: false, message: "Server error" });
//   }
// };


export const getForumAndPollFeed = async (req, res) => {
  try {
    const userId = req.userId;
    const { subject, search, sortBy } = req.query;

    // =======================
    // 1) Fetch Forums
    // =======================
    let forumQuery = `
      SELECT 
        p.id,
        p.content,
        s.subject AS subject_tag,     
        g.grade_level AS grade_level,       
        p.type_of_upload,
        p.created_at AT TIME ZONE 'UTC' AS created_at,
        p.forum_title AS forum_title,

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

        COALESCE(
          JSON_AGG(
            DISTINCT JSONB_BUILD_OBJECT(
              'id', fc.id,
              'content', fc.content,
              'created_at', fc.created_at AT TIME ZONE 'UTC',
              'user_id', cu.id,
              'user_name', cu.name,
              'profile_photo_url', cu.profile_photo_url
            )
          ) FILTER (WHERE fc.id IS NOT NULL),
          '[]'
        ) AS comments,

        COALESCE(u.id, a.id) AS author_id,
        COALESCE(u.name, a.name) AS author_name,
        COALESCE(u.profile_photo_url, a.profile_photo_url) AS profile_photo_url,
        u.school_name,
        u.grade_level AS user_grade_level,
        COALESCE(u.created_at, a.created_at) AT TIME ZONE 'UTC' AS author_created_at,
        CASE 
          WHEN u.id IS NOT NULL THEN 'user'
          WHEN a.id IS NOT NULL THEN 'admin'
        END AS author_type,

        COALESCE(l.like_count, 0) AS like_count,
        COALESCE(c.comment_count, 0) AS comment_count,
        CASE WHEN ul.user_id IS NOT NULL THEN true ELSE false END AS is_liked_by_user,
        CASE WHEN sf.user_id IS NOT NULL THEN true ELSE false END AS is_forum_saved,

        COALESCE(v.view_count, 0) AS view_count

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

      LEFT JOIN forum_likes ul 
        ON ul.post_id = p.id AND ul.user_id = $1

      LEFT JOIN subjects s ON s.id = p.subject_tag
      LEFT JOIN grades g ON g.id = p.grade_level

      LEFT JOIN user_saved_forums sf 
        ON sf.forum_post_id = p.id AND sf.user_id = $1

      LEFT JOIN (
        SELECT forum_post_id, COUNT(*) AS view_count
        FROM forum_views
        GROUP BY forum_post_id
      ) v ON v.forum_post_id = p.id
    `;

    const conditions = [];
    const params = [userId];

    if (subject) {
      params.push(subject);
      conditions.push(`p.subject_tag = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`p.forum_title ILIKE $${params.length}`);
    }

    if (conditions.length > 0) {
      forumQuery += ` WHERE ${conditions.join(" AND ")}`;
    }

    forumQuery += ` GROUP BY 
      p.id, s.subject, g.grade_level,
      u.id, a.id, l.like_count, c.comment_count, ul.user_id, sf.user_id, v.view_count
    `;

    const forumRes = await pool.query(forumQuery, params);
    const forums = forumRes.rows.map(f => ({
      ...f,
      data_type: "forum",
      created_at: f.created_at ? new Date(f.created_at).toISOString() : new Date().toISOString(),
      comments: f.comments.map(c => ({
        ...c,
        created_at: c.created_at ? new Date(c.created_at).toISOString() : null
      }))
    }));

    // =======================
    // 2) Fetch Polls
    // =======================
    let pollQuery = `
      SELECT 
        p.id,
        p.question AS poll_title,
        p.created_at AT TIME ZONE 'UTC' AS created_at,
        p.expires_at AT TIME ZONE 'UTC' AS expires_at,
        p.subject_id,
        p.grade_level,

        COALESCE(v.view_count, 0) AS view_count,

        CASE WHEN uv.user_id IS NOT NULL THEN true ELSE false END AS has_voted,
        uv.option_id AS user_selected_option,

        CASE WHEN usp.user_id IS NOT NULL THEN true ELSE false END AS is_poll_saved,

        COALESCE(l.like_count, 0) AS like_count,
        COALESCE(c.comment_count, 0) AS comment_count,
        CASE WHEN ul.user_id IS NOT NULL THEN true ELSE false END AS is_liked_by_user,

        COALESCE(
          JSON_AGG(
            DISTINCT JSONB_BUILD_OBJECT(
              'id', pc.id,
              'comment', pc.comment,
              'created_at', pc.created_at AT TIME ZONE 'UTC',
              'user_id', cu.id,
              'user_name', cu.name,
              'profile_photo_url', cu.profile_photo_url
            )
          ) FILTER (WHERE pc.id IS NOT NULL),
          '[]'
        ) AS comments,

        COALESCE(
          JSON_AGG(
            DISTINCT JSONB_BUILD_OBJECT(
              'id', po.id,
              'option_text', po.option_text,
              'vote_count', COALESCE(pvc.vote_count, 0),
              'voters', COALESCE(pvc.voters, '[]')
            )
          ) FILTER (WHERE po.id IS NOT NULL),
          '[]'
        ) AS options

      FROM polls p
      LEFT JOIN (
        SELECT poll_id, COUNT(*) AS view_count
        FROM poll_views
        GROUP BY poll_id
      ) v ON v.poll_id = p.id

      LEFT JOIN poll_options po ON po.poll_id = p.id
      LEFT JOIN (
        SELECT 
          pv.option_id,
          COUNT(pv.id) AS vote_count,
          json_agg(json_build_object('id', u.id, 'name', u.name)) AS voters
        FROM poll_votes pv
        LEFT JOIN users u ON u.id = pv.user_id
        GROUP BY pv.option_id
      ) pvc ON pvc.option_id = po.id

      LEFT JOIN (
        SELECT pv.poll_id, pv.option_id, pv.user_id
        FROM poll_votes pv
        WHERE pv.user_id = $2
      ) uv ON uv.poll_id = p.id

      LEFT JOIN user_saved_polls usp
        ON usp.poll_id = p.id AND usp.user_id = $2

      LEFT JOIN (
        SELECT poll_id, COUNT(*) AS like_count
        FROM poll_likes
        GROUP BY poll_id
      ) l ON l.poll_id = p.id

      LEFT JOIN poll_likes ul 
        ON ul.poll_id = p.id AND ul.user_id = $2

      LEFT JOIN (
        SELECT poll_id, COUNT(*) AS comment_count
        FROM poll_comments
        GROUP BY poll_id
      ) c ON c.poll_id = p.id

      LEFT JOIN poll_comments pc ON pc.poll_id = p.id
      LEFT JOIN users cu ON cu.id = pc.user_id

      WHERE (p.expires_at IS NULL OR p.expires_at > $1)
    `;

    const pollParams = [new Date().toISOString(), userId];
    if (subject) {
      pollParams.push(subject);
      pollQuery += ` AND p.subject_id = $${pollParams.length}`;
    }
    if (search) {
      pollParams.push(`%${search}%`);
      pollQuery += ` AND p.question ILIKE $${pollParams.length}`;
    }

    pollQuery += `
      GROUP BY p.id, v.view_count, uv.user_id, uv.option_id, usp.user_id, l.like_count, c.comment_count, ul.user_id
    `;

    const pollRes = await pool.query(pollQuery, pollParams);
    const polls = pollRes.rows.map(p => ({
      ...p,
      data_type: "poll",
      has_voted: p.has_voted || false,
      user_selected_option: p.user_selected_option || null,
      created_at: p.created_at ? new Date(p.created_at).toISOString() : new Date().toISOString(),
      expires_at: p.expires_at ? new Date(p.expires_at).toISOString() : null,
      comments: p.comments.map(c => ({
        ...c,
        created_at: c.created_at ? new Date(c.created_at).toISOString() : null
      }))
    }));

    // =======================
    // 3) Merge + Sort
    // =======================
    let feed = [...forums, ...polls];

    if (sortBy === "most_recent") {
      feed.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else if (sortBy === "most_old") {
      feed.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } else if (sortBy === "most_view") {
      feed.sort((a, b) => Number(b.view_count) - Number(a.view_count));
    } else {
      feed.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    return res.json({ ok: true, data: feed });
  } catch (err) {
    console.error("getForumAndPollFeed error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
};



// add views count.......

export const addView = async (req, res) => {
  const userId = req.userId;
  const { type, id } = req.body; // type = "forum" | "poll"

  try {
    if (!userId) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }
    if (!["forum", "poll"].includes(type)) {
      return res.status(400).json({ ok: false, message: "Invalid type" });
    }
    if (!id) {
      return res.status(400).json({ ok: false, message: "ID is required" });
    }

    let exists;
    if (type === "forum") {
      exists = await pool.query(
        `SELECT id FROM forum_posts WHERE id = $1 LIMIT 1`,
        [id]
      );
      if (exists.rowCount === 0) {
        return res.status(404).json({ ok: false, message: "Forum not found" });
      }

      await pool.query(
        `INSERT INTO forum_views (forum_post_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (forum_post_id, user_id) DO NOTHING`,
        [id, userId]
      );
    } else if (type === "poll") {
      exists = await pool.query(
        `SELECT id FROM polls WHERE id = $1 LIMIT 1`,
        [id]
      );
      if (exists.rowCount === 0) {
        return res.status(404).json({ ok: false, message: "Poll not found" });
      }

      await pool.query(
        `INSERT INTO poll_views (poll_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (poll_id, user_id) DO NOTHING`,
        [id, userId]
      );
    }

    return res.json({ ok: true, message: "View added" });
  } catch (err) {
    console.error("addView error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
};

// get notes files.............

export const getNotesfromTopics = async (req, res) => {
  try {
    const { topic_id, search } = req.body;

    if (!topic_id) {
      return res.status(400).json({ message: "topic_id is required" });
    }

    // ✅ Check if topic exists
    const topicCheckQuery = `SELECT id FROM topics WHERE id = $1 LIMIT 1`;
    const topicCheck = await pool.query(topicCheckQuery, [topic_id]);

    if (topicCheck.rowCount === 0) {
      return res.status(404).json({ message: "Topic not found" });
    }

    // ✅ Fetch notes for the topic with optional search
    let notesQuery = `
      SELECT ff.*
      FROM forum_posts fp
      JOIN forum_files ff ON ff.post_id = fp.id
      WHERE fp.topic_id = $1
        AND fp.type_of_upload = 'Notes'
        AND ff.url IS NOT NULL
    `;
    const values = [topic_id];

    if (search) {
      notesQuery += ` AND ff.filename ILIKE $2`;
      values.push(`%${search}%`);
    }

    const { rows } = await pool.query(notesQuery, values);

    return res.status(200).json({
      success: true,
      search: search || null,
      data: rows, // array of objects with { url, filename, etc. }
    });

  } catch (error) {
    console.error("Error fetching notes:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};



// notes access stored.......

export const trackNoteAccess = async (req, res) => {
  try {
    const { forum_file_id, action } = req.body;
    const user_id = req.userId;

    if (!forum_file_id || !['view', 'share'].includes(action)) {
      return res.status(400).json({ message: "Invalid request" });
    }

    await pool.query(
      `INSERT INTO notes_access (user_id, forum_file_id, action) VALUES ($1, $2, $3)`,
      [user_id, forum_file_id, action]
    );

    return res.status(200).json({ success: true, message: "Note access recorded" });

  } catch (error) {
    console.error("Error tracking note access:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};
