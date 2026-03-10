import pool from "../../database.js";

export const findUserByEmail = async (email) => {
  const res = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  return res.rows[0];
};

export const findUserByPhone = async (phone) => {
  const res = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
  return res.rows[0];
};

export const createUser = async ({ email, phone, name, grade_level, selected_subjects, daily_reminder_time, questions_per_day, profile_photo_url, school_name, grade_id }) => {
  const res = await pool.query(
    `INSERT INTO users (email, phone, name, grade_level, selected_subjects, daily_reminder_time, questions_per_day, profile_photo_url, school_name, grade_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, $9, $10) RETURNING *`,
    [email, phone, name, grade_level, selected_subjects, daily_reminder_time, questions_per_day, profile_photo_url, school_name, grade_id]
  );
  await pool.query(
    `INSERT INTO user_settings (user_id)
       VALUES ($1)`,
    [res.rows[0].id]
  );

  return res.rows[0];
};

export const createUsernew = async ({ email, phone, name, grade_level, selected_subjects, daily_reminder_time, questions_per_day, profile_photo_url, school_name, grade_id, password }) => {
  const res = await pool.query(
    `INSERT INTO users (email, phone, name, grade_level, selected_subjects, daily_reminder_time, questions_per_day, profile_photo_url, school_name, grade_id, password)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, $9, $10, $11) RETURNING *`,
    [email, phone, name, grade_level, selected_subjects, daily_reminder_time, questions_per_day, profile_photo_url, school_name, grade_id, password]
  );
  await pool.query(
    `INSERT INTO user_settings (user_id)
       VALUES ($1)`,
    [res.rows[0].id]
  );

  return res.rows[0];
};





// export const updateUser = async (id, fields) => {
//   const keys = Object.keys(fields);
//   const values = Object.values(fields);
//   if (!keys.length) return null;
//   const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
//   const res = await pool.query(`UPDATE users SET ${sets} WHERE id = $${keys.length + 1} RETURNING *`, [...values, id]);
//   return res.rows[0];
// };

export const updateUser = async (id, fields) => {
  const keys = Object.keys(fields);
  if (!keys.length) return null;

  const values = [];
  const setClauses = keys.map((key, i) => {
    values.push(fields[key]);
    return `${key} = $${i + 1}`;
  });

  const query = `
    UPDATE users
    SET ${setClauses.join(", ")}, updated_at = NOW()
    WHERE id = $${keys.length + 1}
    RETURNING *;
  `;

  const result = await pool.query(query, [...values, id]);
  return result.rows[0];
};

export const updateUserSettings = async (id, fields) => {
  const keys = Object.keys(fields);
  if (!keys.length) return null;

  const values = [];
  const setClauses = keys.map((key, i) => {
    values.push(fields[key]);
    return `${key} = $${i + 1}`;
  });

  const query = `
    UPDATE user_settings
    SET ${setClauses.join(", ")}, updated_at = NOW()
    WHERE user_id = $${keys.length + 1}
    RETURNING *;
  `;

  const result = await pool.query(query, [...values, id]);
  const updatedUserSettings = result.rows[0];

  // 🔹 Now fetch subjects if selected_subjects exists
  let selectedSubjects = [];
  if (
    updatedUserSettings.selected_subjects &&
    updatedUserSettings.selected_subjects.length > 0
  ) {
    const { rows } = await pool.query(
      `SELECT id, subject 
       FROM subjects 
       WHERE id = ANY($1::int[])`,
      [updatedUserSettings.selected_subjects.map(Number)]
    );
    selectedSubjects = rows.map((r) => ({ id: r.id, subject: r.subject }));
  }

  return {
    ...updatedUserSettings,
    selected_subjects: selectedSubjects,
  };
};


export const getUserById = async (userId) => {
  const result = await pool.query(
    `
    SELECT
      u.id,
      u.email,
      u.phone,
      u.name,
      u.school_name,
      u.grade_level,
      u.questions_per_day,
      u.daily_reminder_time,
      u.selected_subjects,
      u.profile_photo_url,
      u.created_at,
      u.grade_id,
      u.updated_at,
      u.biometric_enabled,
      u.role,

      us.quiz_time_seconds,
      us.reminder_enabled,
      us.dark_mode,
      us.sound_enabled,
      us.study_reminder,
      us.forum_update,
      us.enable_biometric,

      g.grade_level AS grade_value

    FROM users u
    LEFT JOIN user_settings us
      ON us.user_id = u.id
    LEFT JOIN grades g
      ON g.id = u.grade_id

    WHERE u.id = $1
    `,
    [userId]
  );

  if (!result.rows.length) {
    return null;
  }

  const user = result.rows[0];

  // Convert subject IDs to subject objects
  if (user.selected_subjects && user.selected_subjects.length) {

    const subjects = await pool.query(
      `
      SELECT id, subject
      FROM subjects
      WHERE id = ANY($1::int[])
      `,
      [user.selected_subjects]
    );

    user.selected_subjects = subjects.rows;
  } else {
    user.selected_subjects = [];
  }

  return user;
};

