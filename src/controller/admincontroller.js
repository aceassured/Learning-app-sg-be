import pool from "../../database.js";


// create poll...........


export const admincreatePoll = async (req, res) => {
  try {
    const { question, allow_multiple = false, expires_at = null, options } = req.body;
    const adminId = req.userId;; // assuming req.user is set after auth & role check

    if (!question || !options || options.length < 2) {
      return res.status(400).json({ message: "Question and at least 2 options required" });
    }

    // Insert poll
    const pollResult = await pool.query(
      `INSERT INTO polls (question, allow_multiple, expires_at) VALUES ($1,$2,$3) RETURNING *`,
      [question, allow_multiple, expires_at]
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

// get all active poll....

export const getAllpoll = async (req, res) => {
  try {
    const now = new Date();

    // get all active polls
    const polls = await pool.query(
      `SELECT * FROM polls 
       WHERE expires_at IS NULL OR expires_at > $1
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
