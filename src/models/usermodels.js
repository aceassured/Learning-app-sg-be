// src/models/usermodels.js
import pool from "../../database.js";

export const findUserByEmail = async (email) => {
  const res = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  return res.rows[0];
};

export const findUserByPhone = async (phone) => {
  const res = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
  return res.rows[0];
};

export const createUser = async ({ email, phone, name, grade_level, selected_subjects, daily_reminder_time, questions_per_day, profile_photo_url, school_name}) => {
  const res = await pool.query(
    `INSERT INTO users (email, phone, name, grade_level, selected_subjects, daily_reminder_time, questions_per_day, profile_photo_url, school_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, $9) RETURNING *`,
    [email, phone, name, grade_level, selected_subjects, daily_reminder_time, questions_per_day, profile_photo_url, school_name]
  );
  return res.rows[0];
};

export const updateUser = async (id, fields) => {
  const keys = Object.keys(fields);
  const values = Object.values(fields);
  if (!keys.length) return null;
  const sets = keys.map((k, i) => `${k} = $${i+1}`).join(', ');
  const res = await pool.query(`UPDATE users SET ${sets} WHERE id = $${keys.length+1} RETURNING *`, [...values, id]);
  return res.rows[0];
};

export const getUserById = async (id) => {
  const res = await pool.query(
    `SELECT ud.*, us.*
     FROM users ud
     INNER JOIN user_settings us ON us.user_id = ud.id
     WHERE ud.id = $1`,
    [id]
  );
  return res.rows[0];
};
