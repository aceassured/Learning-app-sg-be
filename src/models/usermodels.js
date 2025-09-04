import pool from "../../database.js";

export const findUserByEmail = async (email) => {
  const res = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  return res.rows[0];
};

export const findUserByPhone = async (phone) => {
  const res = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
  return res.rows[0];
};

export const createUser = async ({ email, phone, name, grade_level, selected_subjects, daily_reminder_time, questions_per_day, profile_photo_url, school_name , grade_id}) => {
  const res = await pool.query(
    `INSERT INTO users (email, phone, name, grade_level, selected_subjects, daily_reminder_time, questions_per_day, profile_photo_url, school_name, grade_id,)
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
  return result.rows[0];
};

export const getUserById = async (id) => {
  console.log("id", id);
  
  const res = await pool.query(
    `SELECT ud.*, us.*
     FROM users ud
     INNER JOIN user_settings us ON us.user_id = ud.id
     WHERE ud.id = $1`,
    [id]
  );

  if (!res.rows[0]) return null;

  const user = res.rows[0];

  // Convert selected_subjects IDs to objects with id and subject
  let selectedSubjects = [];
  if (user.selected_subjects && user.selected_subjects.length > 0) {
    const { rows } = await pool.query(
      `SELECT id, subject FROM subjects WHERE id = ANY($1::int[])`,
      [user.selected_subjects.map(Number)]
    );
    selectedSubjects = rows.map((r) => ({ id: r.id, subject: r.subject }));
  }

  return {
    ...user,
    selected_subjects: selectedSubjects,
  };
};
