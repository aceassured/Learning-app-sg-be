import { findUserByEmail, findUserByPhone, createUser, updateUser, getUserById, updateUserSettings, createUsernew } from "../models/usermodels.js"
import dotenv from 'dotenv';
import jwt from "jsonwebtoken"
import pool from "../../database.js";
dotenv.config({ quiet: true });
import bcrypt from "bcrypt"
import crypto from "crypto";
import nodemailer from "nodemailer";
import { uploadBufferToVercel } from "../utils/vercel-blob.js";

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

export const login = async (req, res) => {
  try {
    const { email, phone } = req.body;
    let user = null;

    if (email) user = await findUserByEmail(email);
    if (!user && phone) user = await findUserByPhone(phone);

    if (user) {
      console.log(user.selected_subjects)
      // Convert selected_subjects IDs to names
      let selectedSubjectsNames = [];
      if (user.selected_subjects && user.selected_subjects.length > 0) {
        console.log(user.selected_subjects)
        const { rows } = await pool.query(
          `SELECT id,icon,subject FROM subjects WHERE id = ANY($1::int[])`,
          [user.selected_subjects.map(Number)]
        );
        selectedSubjectsNames = rows.map((r) => ({ id: r.id, subject: r.subject, icon: r.icon }));
      }

      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

      // Replace IDs with names in response
      const userResponse = {
        ...user,
        selected_subjects: selectedSubjectsNames,
      };

      return res.json({ ok: true, user: userResponse, token, redirect: 'home' });
    }

    return res.json({ ok: false, message: 'Not found', redirect: 'register' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: 'Server error' });
  }
};

export const Commonlogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ status: false, message: "Email and password are required" });
    }

    // const existingUser = await pool.query(
    //   "SELECT id, name, email, password, selected_subjects FROM users WHERE email = $1",
    //   [email]
    // );

    // const exisitingUserRuesult = existingUser.rows[0]
    // if (!exisitingUserRuesult) {
    //   return res.status(404).json({
    //     status: false,
    //     message: "User not found. Please sign up to continue.",
    //   });

    // }
    // ✅ Fetch user by email
    const { rows } = await pool.query(
      "SELECT id, name, email, password, selected_subjects FROM users WHERE email = $1",
      [email]
    );

    const user = rows[0];
    if (!user) {
      return res.status(401).json({ status: false, message: "User not found. Please sign up to continue.", });
    }

    // ✅ Compare password with hashed password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ status: false, message: "Invalid credentials" });
    }

    // ✅ Fetch subject details only if selected_subjects exist
    let selectedSubjectsNames = [];
    if (user.selected_subjects && user.selected_subjects.length > 0) {
      const { rows: subjectRows } = await pool.query(
        `SELECT id, icon, subject 
         FROM subjects 
         WHERE id = ANY($1::int[])`,
        [user.selected_subjects.map(Number)]
      );
      selectedSubjectsNames = subjectRows.map((r) => ({
        id: r.id,
        subject: r.subject,
        icon: r.icon,
      }));
    }

    // ✅ Generate JWT token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });

    // ✅ Return response without password
    const { password: _, ...userData } = user;

    return res.json({
      status: true,
      data: {
        ...userData,
        selected_subjects: selectedSubjectsNames,
      },
      token
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ status: false, message: "Server error" });
  }
};

export const register = async (req, res) => {
  try {
    const { email, phone, name, grade_level, selected_subjects, daily_reminder_time, questions_per_day, school_name, grade_id } = req.body;

    console.log(req.body)
    if (!grade_level || !selected_subjects || selected_subjects.length < 3 || !questions_per_day || !grade_id) {
      return res.status(400).json({ ok: false, message: 'Missing or invalid fields. Select minimum 3 subjects.' });
    }

    const user = await createUser({
      email: email || null,
      phone: phone || null,
      name: name,
      grade_level,
      selected_subjects,
      daily_reminder_time,
      questions_per_day,
      profile_photo_url: null,
      school_name,
      grade_id

    });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

    return res.json({ status: true, message: 'Registered Successfully', user, token, redirect: 'home' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, message: 'Server error' });
  }
};

// user register.........

export const userregisterApi = async (req, res) => {
  try {
    const {
      email,
      phone,
      name,
      grade_level,
      selected_subjects,
      daily_reminder_time,
      questions_per_day,
      school_name,
      grade_id,
      password,
      confirmPassword
    } = req.body;

    console.log(req.body);

    // ✅ Validate required fields
    if (
      !grade_level ||
      !selected_subjects ||
      selected_subjects.length < 3 ||
      !grade_id
    ) {
      return res.status(400).json({
        status: false,
        message: "Missing or invalid fields. Select minimum 3 subjects."
      });
    }

    // ✅ Validate password
    if (!password || !confirmPassword) {
      return res.status(400).json({ status: false, message: "Password and confirmPassword are required" });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ status: false, message: "Passwords do not match" });
    }

    // ✅ Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // ✅ Insert user into DB
    const user = await createUsernew({
      email: email || null,
      phone: phone || null,
      name,
      grade_level,
      selected_subjects,
      daily_reminder_time,
      questions_per_day,
      profile_photo_url: null,
      school_name,
      grade_id,
      password: hashedPassword, // store hashed password
    });

    // ✅ Generate JWT
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });

    // ✅ Never return password in response 
    const { password: _, ...userData } = user;

    return res.json({
      status: true,
      message: "Registered Successfully",
      user: userData,
      token,
      redirect: "home"
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, message: "Server error" });
  }
};

// just register.........

const generateOtp = () => Math.floor(10000 + Math.random() * 90000).toString();

export const userJustregisterApi = async (req, res) => {
  try {
    const { email, name, password, confirmPassword } = req.body;

    if (!email || !name || !password || !confirmPassword) {
      return res.status(400).json({ status: false, message: "All fields are required" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ status: false, message: "Passwords do not match" });
    }

    // ✅ Check if email already exists
    const existingUser = await pool.query(`SELECT * FROM users WHERE email = $1`, [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ status: false, message: "Email already registered" });
    }

    // ✅ Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // ✅ Generate OTP & expiry
    const otp = generateOtp();
    const otpExpiry = new Date(Date.now() + 2 * 60 * 1000); // 10 mins from now

    // ✅ Insert user into DB (with OTP + expiry)
    const userRes = await pool.query(
      `INSERT INTO users (email, name, password, otp, otp_expire_time) 
       VALUES ($1,$2,$3,$4,$5) RETURNING id, email, name`,
      [email, name, hashedPassword, otp, otpExpiry]
    );

    const user = userRes.rows[0];

    await pool.query(
      `INSERT INTO user_settings (user_id)
       VALUES ($1)`,
      [user.id]
    );

    // ✅ Setup nodemailer
    const transporter = nodemailer.createTransport({
      service: "gmail", // or other provider
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    // ✅ Send OTP email
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your OTP Code",
      text: `Your OTP code is ${otp}. It is valid for 10 minutes.`,
    });

    return res.json({
      status: true,
      message: "Registered successfully. OTP sent to email.",
      user,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, message: "Server error" });
  }
};
// email verify......

export const userverifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ status: false, message: "Email and OTP are required" });
    }

    // ✅ Find user
    const userRes = await pool.query(`SELECT * FROM users WHERE email = $1`, [email]);
    if (userRes.rows.length === 0) {
      return res.status(400).json({ status: false, message: "User not found" });
    }

    const user = userRes.rows[0];

    // ✅ Check OTP match
    if (user.otp !== otp) {
      return res.status(400).json({ status: false, message: "Invalid OTP" });
    }

    // ✅ Check OTP expiry
    if (new Date() > new Date(user.otp_expire_time)) {
      return res.status(400).json({ status: false, message: "OTP expired" });
    }

    // ✅ Clear OTP after verification + mark as verified
    await pool.query(
      `UPDATE users SET otp = NULL, otp_expire_time = NULL, is_verified = true WHERE id = $1`,
      [user.id]
    );

    return res.json({ status: true, message: "OTP verified successfully" });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};




export const getProfile = async (req, res) => {
  try {
    const user = await getUserById(req.userId);
    res.json({ ok: true, user });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Server error' });
  }
};

export const editProfile = async (req, res) => {
  try {
    const updates = { ...req.body };
    if (req.fileUrl) updates.profile_photo_url = req.fileUrl;

    // --- Split fields ---
    const userFields = {};
    const settingsFields = {};

    if (updates.name !== undefined) userFields.name = updates.name;
    if (updates.school_name !== undefined) userFields.school_name = updates.school_name;

    if (updates.grade_level !== undefined)
      userFields.grade_level = parseInt(updates.grade_level, 10);

    if (updates.questions_per_day !== undefined)
      userFields.questions_per_day = parseInt(updates.questions_per_day, 10);

    if (updates.selected_subjects !== undefined)
      userFields.selected_subjects = updates.selected_subjects.map(Number);

    if (updates.profile_photo_url !== undefined)
      userFields.profile_photo_url = updates.profile_photo_url;

    // settings fields
    if (updates.study_reminder !== undefined)
      settingsFields.study_reminder =
        updates.study_reminder === "true" || updates.study_reminder === true;

    if (updates.forum_update !== undefined)
      settingsFields.forum_update =
        updates.forum_update === "true" || updates.forum_update === true;

    // --- Update both tables ---
    let updatedUser = null;
    if (Object.keys(userFields).length > 0) {
      updatedUser = await updateUser(req.userId, userFields);
    }

    let updatedSettings = null;
    if (Object.keys(settingsFields).length > 0) {
      updatedSettings = await updateUserSettings(req.userId, settingsFields);
    }

    res.json({
      ok: true,
      user: updatedUser,
      settings: updatedSettings,
    });
  } catch (err) {
    console.error("❌ editProfile error:", err);
    res.status(500).json({
      ok: false,
      message: "Server error",
      error: err.message,
    });
  }
};



// admin apis..........

export const commonLogin = async (req, res) => {
  try {
    const { email, phone, password } = req.body;

    if (email && password) {
      const { rows } = await pool.query(
        "SELECT id, email, password FROM admins WHERE email = $1 LIMIT 1",
        [email]
      );

      if (rows.length === 0) {
        return res.status(401).json({ success: false, message: "Invalid credentials" });
      }

      const admin = rows[0];
      const isMatch = await bcrypt.compare(password, admin.password);

      if (!isMatch) {
        return res.status(401).json({ success: false, message: "Invalid credentials" });
      }

      const token = jwt.sign(
        { userId: admin.id, role: "admin" },
        process.env.JWT_SECRET,
        { expiresIn: "1d" }
      );

      const updateQuery = `UPDATE admins SET last_login = NOW() WHERE id = $1`;
      await pool.query(updateQuery, [admin.id]);

      return res.json({ success: true, token, role: "admin", id: admin.id });
    }

    if (email || phone) {
      const field = email ? "email" : "phone";
      const value = email || phone;

      const { rows } = await pool.query(
        `SELECT id, email, phone, role FROM users WHERE ${field} = $1 LIMIT 1`,
        [value]
      );

      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      const user = rows[0];

      const token = jwt.sign(
        { userId: user.id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "1d" }
      );

      return res.json({ success: true, token, role: "user", id: user.id });
    }

    return res.status(400).json({ success: false, message: "Invalid login request" });

  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};


// user register............

export const userRegister = async (req, res) => {
  try {
    const {
      email,
      phone,
      name,
      grade_level,
      grade_id,
      questions_per_day,
      daily_reminder_time,
      selected_subjects,
    } = req.body;

    if (!email && !phone) {
      return res.status(400).json({
        success: false,
        message: "Email or phone is required",
      });
    }

    // 🔑 Parse to integers where needed
    const parsedGradeId = grade_id ? parseInt(grade_id, 10) : null;
    const parsedGradeLevel = grade_level ? parseInt(grade_level, 10) : null;
    const parsedSubjects = Array.isArray(selected_subjects)
      ? selected_subjects.map((s) => parseInt(s, 10))
      : null;

    console.log("grade_level:", parsedGradeLevel, "grade_id:", parsedGradeId);

    await pool.query("BEGIN");

    const { rows: existing } = await pool.query(
      `SELECT id, email, phone FROM users WHERE email = $1 OR phone = $2 LIMIT 1`,
      [email || null, phone || null]
    );

    if (existing.length > 0) {
      const conflict = existing[0].email === email ? "Email" : "Phone";
      await pool.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: `${conflict} already registered`,
      });
    }

    const { rows } = await pool.query(
      `INSERT INTO users 
       (email, phone, name, grade_level, questions_per_day, daily_reminder_time, selected_subjects, grade_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())
       RETURNING id, email, phone, name, grade_level, questions_per_day, daily_reminder_time, selected_subjects, grade_id`,
      [
        email || null,
        phone || null,
        name || null,
        parsedGradeLevel,
        questions_per_day || null,
        daily_reminder_time || null,
        parsedSubjects,
        parsedGradeId,
      ]
    );

    const newUser = rows[0];

    await pool.query(
      `INSERT INTO users_settings (user_id, created_at, updated_at)
       VALUES ($1, now(), now())`,
      [newUser.id]
    );

    await pool.query("COMMIT");

    const token = jwt.sign(
      { userId: newUser.id, role: "user" },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    return res.status(201).json({
      success: true,
      message: "User registered successfully",
      user: newUser,
      token,
    });
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("❌ User register error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};



// get user details.............

export const getUserdetails = async (req, res) => {
  try {
    const userId = req.params.id || req.userId;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const { rows } = await pool.query(
      `SELECT ud.*, us.*
     FROM users ud
     INNER JOIN users_settings us ON us.user_id = ud.id
     WHERE ud.id = $1`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = rows[0];
    console.log("user", user)

    return res.status(200).json({
      success: true,
      message: "User details fetched successfully",
      data: user,
    });

  } catch (error) {
    console.error("❌ Get user details error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};


// get admin details.........


export const getAdmindetails = async (req, res) => {
  try {
    const userId = req.params.id || req.userId;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const { rows } = await pool.query(
      `SELECT *
     FROM admins 
     WHERE id = $1`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = rows[0];
    console.log("user", user)

    return res.status(200).json({
      success: true,
      message: "Admin details fetched successfully",
      data: user,
    });

  } catch (error) {
    console.error("❌ Get admin details error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// user edit.......

// export const userEdit = async (req, res) => {
//   try {
//     const userId = req.userId;
//     if (!userId) {
//       return res.status(401).json({ ok: false, message: "Unauthorized" });
//     }

//     const {
//       name,
//       email,
//       phone,
//       grade_level,
//       questions_per_day,
//       daily_reminder_time,
//       selected_subjects,
//       role,
//       quiz_time_seconds,
//       reminder_enabled,
//       dark_mode,
//       sound_enabled
//     } = req.body;

//     let profilePhotoUrl;

//     if (req.file && req.file.buffer) {
//       const filename = `user_${userId}_${Date.now()}_${req.file.originalname}`;
//       profilePhotoUrl = await uploadBufferToVercel(req.file.buffer, filename);
//     }

//     await pool.query("BEGIN");

//     const userUpdateQuery = `
//       UPDATE users 
//       SET 
//         name = COALESCE($1, name),
//         email = COALESCE($2, email),
//         phone = COALESCE($3, phone),
//         grade_level = COALESCE($4, grade_level),
//         questions_per_day = COALESCE($5, questions_per_day),
//         daily_reminder_time = COALESCE($6, daily_reminder_time),
//         selected_subjects = COALESCE($7, selected_subjects),
//         role = COALESCE($8, role),
//         profile_photo_url = COALESCE($9, profile_photo_url),
//         updated_at = NOW()
//       WHERE id = $10
//       RETURNING *;
//     `;

//     const userResult = await pool.query(userUpdateQuery, [
//       name || null,
//       email || null,
//       phone || null,
//       grade_level || null,
//       questions_per_day || null,
//       daily_reminder_time || null,
//       selected_subjects ? selected_subjects : null,
//       role || null,
//       profilePhotoUrl || null,
//       userId
//     ]);

//     if (userResult.rows.length === 0) {
//       throw new Error("User not found");
//     }

//     const settingsUpdateQuery = `
//       INSERT INTO users_settings 
//         (user_id, questions_per_day, quiz_time_seconds, daily_reminder_time, reminder_enabled, dark_mode, sound_enabled, updated_at)
//       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
//       ON CONFLICT (user_id) 
//       DO UPDATE SET 
//         questions_per_day = COALESCE(EXCLUDED.questions_per_day, users_settings.questions_per_day),
//         quiz_time_seconds = COALESCE(EXCLUDED.quiz_time_seconds, users_settings.quiz_time_seconds),
//         daily_reminder_time = COALESCE(EXCLUDED.daily_reminder_time, users_settings.daily_reminder_time),
//         reminder_enabled = COALESCE(EXCLUDED.reminder_enabled, users_settings.reminder_enabled),
//         dark_mode = COALESCE(EXCLUDED.dark_mode, users_settings.dark_mode),
//         sound_enabled = COALESCE(EXCLUDED.sound_enabled, users_settings.sound_enabled),
//         updated_at = NOW()
//       RETURNING *;
//     `;

//     const settingsResult = await pool.query(settingsUpdateQuery, [
//       userId,
//       questions_per_day || null,
//       quiz_time_seconds || null,
//       daily_reminder_time || null,
//       reminder_enabled !== undefined ? reminder_enabled : null,
//       dark_mode !== undefined ? dark_mode : null,
//       sound_enabled !== undefined ? sound_enabled : null
//     ]);

//     await pool.query("COMMIT");

//     return res.status(200).json({
//       ok: true,
//       message: "User details updated successfully",
//       user: userResult.rows[0],
//       settings: settingsResult.rows[0]
//     });

//   } catch (error) {
//     await pool.query("ROLLBACK");
//     console.error("userEdit error:", error);
//     return res.status(500).json({ ok: false, message: "Internal server error", error: error.message });
//   } finally {
//     pool.release();
//   }
// };


export const userEdit = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const {
      name,
      email,
      phone,
      grade_level,
      questions_per_day,
      daily_reminder_time,
      selected_subjects,
      role,
      quiz_time_seconds,
      reminder_enabled,
      dark_mode,
      sound_enabled,
    } = req.body;

    let profilePhotoUrl;

    if (req.file && req.file.buffer) {
      const filename = `user_${userId}_${Date.now()}_${req.file.originalname}`;
      profilePhotoUrl = await uploadBufferToVercel(req.file.buffer, filename);
    }

    await pool.query("BEGIN");

    // -------------------
    // Build dynamic user update query
    // -------------------
    const userFields = [];
    const userValues = [];
    let paramIndex = 1;

    if (name !== undefined) {
      userFields.push(`name = $${paramIndex++}`);
      userValues.push(name);
    }
    if (email !== undefined) {
      userFields.push(`email = $${paramIndex++}`);
      userValues.push(email);
    }
    if (phone !== undefined) {
      userFields.push(`phone = $${paramIndex++}`);
      userValues.push(phone);
    }
    if (grade_level !== undefined) {
      userFields.push(`grade_level = $${paramIndex++}`);
      userValues.push(grade_level);
    }
    if (questions_per_day !== undefined) {
      userFields.push(`questions_per_day = $${paramIndex++}`);
      userValues.push(questions_per_day);
    }
    if (daily_reminder_time !== undefined) {
      userFields.push(`daily_reminder_time = $${paramIndex++}`);
      userValues.push(daily_reminder_time);
    }
    if (selected_subjects !== undefined) {
      userFields.push(`selected_subjects = $${paramIndex++}`);
      userValues.push(selected_subjects);
    }
    if (role !== undefined) {
      userFields.push(`role = $${paramIndex++}`);
      userValues.push(role);
    }
    if (profilePhotoUrl !== undefined) {
      userFields.push(`profile_photo_url = $${paramIndex++}`);
      userValues.push(profilePhotoUrl);
    }

    if (userFields.length > 0) {
      const userUpdateQuery = `
        UPDATE users
        SET ${userFields.join(", ")}, updated_at = NOW()
        WHERE id = $${paramIndex}
        RETURNING *;
      `;
      userValues.push(userId);

      await pool.query(userUpdateQuery, userValues);
    }

    // -------------------
    // Update user settings
    // -------------------
    const settingsUpdateQuery = `
      INSERT INTO user_settings 
        (user_id, quiz_time_seconds, daily_reminder_time, reminder_enabled, dark_mode, sound_enabled, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6, NOW())
      ON CONFLICT (user_id) 
      DO UPDATE SET 
        quiz_time_seconds = COALESCE(EXCLUDED.quiz_time_seconds, user_settings.quiz_time_seconds),
        daily_reminder_time = COALESCE(EXCLUDED.daily_reminder_time, user_settings.daily_reminder_time),
        reminder_enabled = COALESCE(EXCLUDED.reminder_enabled, user_settings.reminder_enabled),
        dark_mode = COALESCE(EXCLUDED.dark_mode, user_settings.dark_mode),
        sound_enabled = COALESCE(EXCLUDED.sound_enabled, user_settings.sound_enabled),
        updated_at = NOW()
      RETURNING *;
    `;

    const settingsResult = await pool.query(settingsUpdateQuery, [
      userId,
      quiz_time_seconds !== undefined ? quiz_time_seconds : null,
      daily_reminder_time !== undefined ? daily_reminder_time : null,
      reminder_enabled !== undefined ? reminder_enabled : null,
      dark_mode !== undefined ? dark_mode : null,
      sound_enabled !== undefined ? sound_enabled : null,
    ]);

    await pool.query("COMMIT");

    return res.status(200).json({
      ok: true,
      message: "User details updated successfully",
      settings: settingsResult.rows[0],
    });
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("userEdit error:", error);
    return res.status(500).json({
      ok: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// admin register............

export const adminRegister = async (req, res) => {

  try {
    const { email, password, name, phone, department, employee_id } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    await pool.query("BEGIN");

    const { rows: existing } = await pool.query(
      `SELECT id FROM admins WHERE email = $1`,
      [email]
    );

    if (existing.length > 0) {
      await pool.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: "Email already registered",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const { rows } = await pool.query(
      `INSERT INTO admins 
       (email, password, name, role, phone, department, employee_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
      [email, hashedPassword, name || null, "admin", phone, department, employee_id]
    );

    const newUser = rows[0];

    await pool.query("COMMIT");

    const token = jwt.sign(
      { userId: newUser.id, role: newUser.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    return res.status(201).json({
      success: true,
      message: "Admin registered successfully",
      data: {
        user: newUser,
        token,
      },
    });
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("❌ Admin register error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};




// Add new user in admin


const generatePassword = (name) => {
  const base = name.substring(0, 4); // take first 4 chars of name
  const upper = base.charAt(0).toUpperCase();
  const randomNum = Math.floor(1000 + Math.random() * 9000); // 4-digit number
  const specialChars = "!@#$%^&*";
  const special = specialChars.charAt(Math.floor(Math.random() * specialChars.length));

  // Example: John1234!
  return `${upper}${base.slice(1)}${randomNum}${special}`.slice(0, 8);
};


export const addNewUser = async (req, res) => {
  const client = await pool.connect();

  try {
    const { name, email, role } = req.body;

    if (!name || !email || !role) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and role are required",
      });
    }

    await client.query("BEGIN");

    // Check if email already exists
    const { rows: existing } = await client.query(
      `SELECT id FROM admins WHERE email = $1`,
      [email]
    );

    if (existing.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: "Email already registered",
      });
    }

    // Generate password
    const plainPassword = generatePassword(name);

    // Hash password before storing
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    // Insert into admins table
    const { rows } = await client.query(
      `INSERT INTO admins (name, email, role, password, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id, name, email, role, created_at`,
      [name, email, role, hashedPassword]
    );

    const newUser = rows[0];

    await client.query("COMMIT");

    // Send email with password
    const transporter = nodemailer.createTransport({
      service: "gmail", // or SMTP config
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: `"Admin Panel" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Your Admin Account Credentials",
      text: `Hello ${name},\n\nYour admin account has been created.\n\nEmail: ${email}\nPassword: ${plainPassword}\n\nPlease login and change your password.\n\nRegards,\nTeam`,
    });

    return res.status(201).json({
      success: true,
      message: "Admin created successfully. Credentials sent via email.",
      data: newUser,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Add new admin error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  } finally {
    client.release();
  }
};




// ----admin user role edit

// export const changeUserRole = async (req, res) => {
//   const client = await pool.connect();
//   try {
//     const { id, role } = req.body;

//     if (!id || !role) {
//       return res.status(400).json({
//         success: false,
//         message: "User ID and role are required",
//       });
//     }

//     await client.query("BEGIN");

//     // Check if user exists
//     const { rows: existing } = await client.query(
//       `SELECT id FROM admins WHERE id = $1`,
//       [id]
//     );

//     if (existing.length === 0) {
//       await client.query("ROLLBACK");
//       return res.status(404).json({
//         success: false,
//         message: "User not found",
//       });
//     }

//     // Update role
//     const { rows } = await client.query(
//       `UPDATE admins SET role = $1 WHERE id = $2 RETURNING id, name, email, role`,
//       [role, id]
//     );

//     await client.query("COMMIT");

//     return res.status(200).json({
//       success: true,
//       message: "User role updated successfully",
//       data: rows[0],
//     });
//   } catch (error) {
//     await client.query("ROLLBACK");
//     console.error("Change user role error:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Internal server error",
//     });
//   } finally {
//     client.release();
//   }
// };



export const changeUserRole = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id, role } = req.body;

    if (!id || !role) {
      return res.status(400).json({
        success: false,
        message: "User ID and target role are required",
      });
    }

    await client.query("BEGIN");

    let result;

    if (role === "student") {
      // 🔹 Move from admins → users
      console.log("690 trigger")
      const { rows: adminRows } = await client.query(
        `SELECT * FROM admins WHERE id = $1`,
        [id]
      );

      if (adminRows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ success: false, message: "Admin not found" });
      }

      const admin = adminRows[0];

      await client.query(`DELETE FROM admins WHERE id = $1`, [id]);

      const insertUserQuery = `
        INSERT INTO users (email, phone, name, grade_level, questions_per_day, daily_reminder_time, selected_subjects, profile_photo_url, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())
        RETURNING id, email, phone, name, grade_level
      `;

      const { rows: userRows } = await client.query(insertUserQuery, [
        admin.email,
        admin.phone || null,
        admin.name || null,
        null, null, null, null,
        admin.profile_photo_url
      ]);

      result = userRows[0];
    }
    else if (role === "admin") {
      // 🔹 Move from users → admins
      console.log("722 trigger")

      const { rows: userRows } = await client.query(
        `SELECT * FROM users WHERE id = $1`,
        [id]
      );

      console.log("userRows", userRows)
      if (userRows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ success: false, message: "User not found" });
      }

      const user = userRows[0];

      // Generate random 6-digit password
      const rawPassword = Math.floor(100000 + Math.random() * 900000).toString();

      // Hash password
      const hashedPassword = await bcrypt.hash(rawPassword, 10);

      // Delete from users  

      await client.query(`UPDATE user_quiz_sessions SET user_id = NULL WHERE user_id = $1`, [id]);
      await client.query(`UPDATE user_activity SET user_id = NULL WHERE user_id = $1`, [id]);
      await client.query(`UPDATE user_settings SET user_id = NULL WHERE user_id = $1`, [id]);
      await client.query(`UPDATE forum_likes SET user_id = NULL WHERE user_id = $1`, [id]);
      await client.query(`UPDATE forum_comments SET user_id = NULL WHERE user_id = $1`, [id]);
      await client.query(`UPDATE forum_posts SET user_id = NULL WHERE user_id = $1`, [id]);

      await client.query(`DELETE FROM users WHERE id = $1`, [id]);

      // Insert into admins
      const insertAdminQuery = `
        INSERT INTO admins (email, password, name, role, phone, department, employee_id, profile_photo_url, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
        RETURNING id, email, name, role
      `;

      const { rows: adminRows } = await client.query(insertAdminQuery, [
        user.email,
        hashedPassword,
        user.name || null,
        "admin",
        user.phone || null,
        null,
        null,
        user.profile_photo_url
      ]);

      result = adminRows[0];

      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: 'csksarathi07@gmail.com',
          pass: 'gmeh ckmx uxfp mloo',
        },
      });

      await transporter.sendMail({
        from: `${process.env.SMTP_USER}`,
        to: user.email,
        subject: "Admin Account Created",
        text: `Hello ${user.name || ""},\n\nYou have been promoted to Admin.\n\nYour login password: ${rawPassword}\n\nPlease change it after logging in.`,
      });
    }
    else {
      await client.query("ROLLBACK");
      return res.status(400).json({ success: false, message: "Invalid target role" });
    }

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: `User role changed to ${role} successfully`,
      data: result,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Change user role error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  } finally {
    client.release();
  }
};



// -----Delete user admin

export const deleteAdminUser = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    await client.query("BEGIN");

    // Check if user exists in users table
    const { rows: userExists } = await client.query(
      `SELECT id FROM users WHERE id = $1`,
      [id]
    );

    if (userExists.length > 0) {
      // Clean up related references first
      await client.query(`UPDATE user_quiz_sessions SET user_id = NULL WHERE user_id = $1`, [id]);
      await client.query(`UPDATE user_activity SET user_id = NULL WHERE user_id = $1`, [id]);
      await client.query(`UPDATE user_settings SET user_id = NULL WHERE user_id = $1`, [id]);
      await client.query(`UPDATE forum_likes SET user_id = NULL WHERE user_id = $1`, [id]);
      await client.query(`UPDATE forum_comments SET user_id = NULL WHERE user_id = $1`, [id]);

      // Delete from users
      await client.query(`DELETE FROM users WHERE id = $1`, [id]);

      await client.query("COMMIT");
      return res.status(200).json({
        success: true,
        message: "User deleted successfully from users table",
      });
    }

    // Check if user exists in admins table
    const { rows: adminExists } = await client.query(
      `SELECT id FROM admins WHERE id = $1`,
      [id]
    );

    if (adminExists.length > 0) {
      await client.query(`DELETE FROM admins WHERE id = $1`, [id]);

      await client.query("COMMIT");
      return res.status(200).json({
        success: true,
        message: "User deleted successfully from admins table",
      });
    }

    // If user not found in both tables
    await client.query("ROLLBACK");
    return res.status(404).json({
      success: false,
      message: "User not found in users or admins table",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Delete user error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  } finally {
    client.release();
  }
};




// ---Get all admin users

export const getAllUsers = async (req, res) => {
  const client = await pool.connect();
  try {
    // Fetch admins
    const { rows: adminRows } = await client.query(
      `SELECT id, name, email, 'admin' AS role, created_at, profile_photo_url
       FROM admins 
       ORDER BY id ASC`
    );

    // Fetch users
    const { rows: userRows } = await client.query(
      `SELECT id, name, email, 'user' AS role, created_at , profile_photo_url
       FROM users 
       ORDER BY id ASC`
    );

    // Merge results
    const allUsers = [...adminRows, ...userRows];

    return res.status(200).json({
      success: true,
      data: allUsers,
    });
  } catch (error) {
    console.error("Get users error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  } finally {
    client.release();
  }
};


export const getAllSubject = async (req, res) => {
  const client = await pool.connect();
  try {
    const { rows: allSubjects } = await client.query(
      `SELECT *
       FROM subjects 
       ORDER BY subject ASC`
    );

    return res.status(200).json({
      success: true,
      data: allSubjects,
    });
  } catch (error) {
    console.error("Get subjects error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  } finally {
    client.release();
  }
};


export const getAllGrade = async (req, res) => {
  const client = await pool.connect();
  try {
    const { rows: allGrades } = await client.query(
      `SELECT *
       FROM grades 
       ORDER BY grade_level ASC`
    );

    return res.status(200).json({
      success: true,
      data: allGrades,
    });
  } catch (error) {
    console.error("Get grades error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  } finally {
    client.release();
  }
};


// admin edit...

export const adminEdit = async (req, res) => {
  try {
    const adminId = req.userId;
    console.log("adminId", adminId)
    const { name, email, phone } = req.body;

    const { rows: existingAdmins } = await pool.query(
      `SELECT * FROM admins WHERE id = $1`,
      [adminId]
    );

    if (existingAdmins.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    let profilePhotoUrl = existingAdmins[0].profile_photo_url;

    if (req.file) {
      const file = req.file;
      profilePhotoUrl = await uploadBufferToVercel(file.buffer, file.originalname);
    }

    const { rows } = await pool.query(
      `UPDATE admins 
       SET name = COALESCE($1, name),
           email = COALESCE($2, email),
           phone = COALESCE($3, phone),
           profile_photo_url = COALESCE($4, profile_photo_url),
           updated_at = NOW()
       WHERE id = $5
       RETURNING id, name, email, phone, profile_photo_url, role, created_at, updated_at`,
      [name || null, email || null, phone || null, profilePhotoUrl || null, adminId]
    );

    return res.json({
      success: true,
      message: "Admin updated successfully",
      data: rows[0],
    });
  } catch (error) {
    console.error("❌ Admin edit error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};



// send otp for admin reset password.......

export const adminResetPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const { rows: existingAdmin } = await pool.query(
      `SELECT id, email FROM admins WHERE email = $1`,
      [email]
    );

    if (existingAdmin.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    const admin = existingAdmin[0];

    const otp = crypto.randomInt(100000, 999999).toString();
    const expiryTime = new Date(Date.now() + 2 * 60 * 1000);

    await pool.query(
      `UPDATE admins SET otp = $1, otp_expire_time = $2 WHERE id = $3`,
      [otp, expiryTime, admin.id]
    );

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: `"Support" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Admin Password Reset OTP",
      html: `
        <h2>Password Reset Request</h2>
        <p>Your OTP for password reset is: <b>${otp}</b></p>
        <p>This OTP will expire in <b>2 minutes</b>.</p>
      `,
    };

    await transporter.sendMail(mailOptions);

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully to your email",
    });
  } catch (error) {
    console.error("❌ Admin reset password error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};


// match otp............


export const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required",
      });
    }

    const result = await pool.query(
      `SELECT id, otp, otp_expire_time 
       FROM admins 
       WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    const admin = result.rows[0];

    if (admin.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    // const now = new Date();
    // if (now > admin.otp_expire_time) {
    //   return res.status(400).json({
    //     success: false,
    //     message: "OTP expired",
    //   });
    // }

    await pool.query(
      `UPDATE admins 
       SET otp = NULL, otp_expire_time = NULL 
       WHERE id = $1`,
      [admin.id]
    );

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully",
    });
  } catch (error) {
    console.error("Verify OTP error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// confirm password.........

export const confirmPassword = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and new password are required",
      });
    }

    const result = await pool.query(
      "SELECT id FROM admins WHERE email = $1",
      [email]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    const admin = result.rows[0];

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    await pool.query(
      "UPDATE admins SET password = $1, updated_at = NOW() WHERE id = $2",
      [hashedPassword, admin.id]
    );

    return res.status(200).json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    console.error("❌ Confirm password error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// new questions add..........


// export const newQuestionsadd = async (req, res) => {
//   try {
//     const {
//       question_text,
//       question_type,
//       topics,
//       options,
//       correct_option_id,
//       difficulty_level,
//       grade_level,
//       category,
//       answer_explanation,   // ✅ new field
//     } = req.body;

//     // validate options (string → parse JSON if needed)
//     let parsedOptions;
//     try {
//       parsedOptions = typeof options === "string" ? JSON.parse(options) : options;
//     } catch (err) {
//       return res.status(400).json({ message: "Invalid options format" });
//     }

//     if (!parsedOptions || parsedOptions.length !== 4 || !correct_option_id || !category || !topics) {
//       return res.status(400).json({ message: "Invalid request body" });
//     }

//     // handle files upload (form-data)
//     let questionFileUrl = null;
//     let answerFileUrl = null;

//     if (req.files?.file?.length > 0) {
//       const file = req.files.file[0];
//       questionFileUrl = await uploadBufferToVercel(file.buffer, file.originalname);
//     }

//     if (req.files?.fileanswer?.length > 0) {
//       const fileAns = req.files.fileanswer[0];
//       answerFileUrl = await uploadBufferToVercel(fileAns.buffer, fileAns.originalname);
//     }

//     const query = `
//       INSERT INTO questions 
//       (subject, question_text, options, correct_option_id, created_at, difficulty_level, grade_level, question_type, question_url, topics, answer_explanation, answer_file_url) 
//       VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8, $9, $10, $11)
//       RETURNING *;
//     `;

//     const values = [
//       category,
//       question_text,
//       JSON.stringify(parsedOptions),
//       correct_option_id,
//       difficulty_level || "Easy",
//       grade_level,
//       question_type,
//       questionFileUrl,   // ✅ question file
//       topics,
//       answer_explanation, // ✅ answer field
//       answerFileUrl      // ✅ answer file
//     ];

//     const result = await pool.query(query, values);

//     return res.status(201).json({
//       message: "Question added successfully",
//       question: result.rows[0],
//     });
//   } catch (error) {
//     console.error("Error adding new question:", error);
//     return res.status(500).json({ message: "Internal Server Error" });
//   }
// };


export const newQuestionsadd = async (req, res) => {
  try {
    const {
      question_text,
      question_type,
      topics,        // topic_id
      options,
      correct_option_id,
      difficulty_level,
      grade_level,   // grade_id
      category,      // subject_id
      answer_explanation,
    } = req.body;

    // ✅ Validate options
    let parsedOptions;
    try {
      parsedOptions =
        typeof options === "string" ? JSON.parse(options) : options;
    } catch (err) {
      return res.status(400).json({ message: "Invalid options format" });
    }

    if (
      !parsedOptions ||
      parsedOptions.length !== 4 ||
      !correct_option_id ||
      !category ||
      !topics ||
      !grade_level
    ) {
      return res.status(400).json({ message: "Invalid request body" });
    }

    // ✅ Fetch subject name
    const subjectRes = await pool.query(
      "SELECT subject FROM subjects WHERE id=$1",
      [category]
    );
    if (subjectRes.rowCount === 0) {
      return res.status(400).json({ message: "Invalid subject id" });
    }
    const subjectName = subjectRes.rows[0].subject;

    // ✅ Fetch topic name
    const topicRes = await pool.query(
      "SELECT topic FROM topics WHERE id=$1",
      [topics]
    );
    if (topicRes.rowCount === 0) {
      return res.status(400).json({ message: "Invalid topic id" });
    }
    const topicName = topicRes.rows[0].topic;

    // ✅ Fetch grade level name
    const gradeRes = await pool.query(
      "SELECT grade_level FROM grades WHERE id=$1",
      [grade_level]
    );
    if (gradeRes.rowCount === 0) {
      return res.status(400).json({ message: "Invalid grade id" });
    }
    const gradeLevelName = gradeRes.rows[0].grade_level;

    // ✅ Handle file uploads
    let questionFileUrl = null;
    let answerFileUrl = null;

    if (req.files?.file?.length > 0) {
      const file = req.files.file[0];
      questionFileUrl = await uploadBufferToVercel(
        file.buffer,
        file.originalname
      );
    }

    if (req.files?.fileanswer?.length > 0) {
      const fileAns = req.files.fileanswer[0];
      answerFileUrl = await uploadBufferToVercel(
        fileAns.buffer,
        fileAns.originalname
      );
    }

    // ✅ Insert into questions
    const query = `
      INSERT INTO questions 
      (subject, question_text, options, correct_option_id, created_at, difficulty_level, grade_level, question_type, question_url, topic_id, answer_explanation, answer_file_url, topics) 
      VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *;
    `;

    const values = [
      subjectName,                   // subject (string from subjects table)
      question_text,
      JSON.stringify(parsedOptions),
      correct_option_id,
      difficulty_level || "Easy",
      gradeLevelName,                // grade_level (string from grades table)
      question_type,
      questionFileUrl,               // question file
      topics,                        // topic_id (FK)
      answer_explanation,
      answerFileUrl,
      topicName               // answer file
    ];

    const result = await pool.query(query, values);

    return res.status(201).json({
      message: "Question added successfully",
      question: result.rows[0],
    });
  } catch (error) {
    console.error("Error adding new question:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};


// get all questions......

export const getAllquestions = async (req, res) => {
  try {
    const query = `SELECT * FROM questions ORDER BY created_at DESC;`;
    const result = await pool.query(query);

    return res.status(200).json({
      message: "Questions fetched successfully",
      total: result.rows.length,
      questions: result.rows,
    });
  } catch (error) {
    console.error("Error fetching questions:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};


export const deleteQuestions = async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ message: "Question ID is required" });
    }

    const query = `DELETE FROM questions WHERE id = $1 RETURNING *;`;
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Question not found" });
    }

    return res.status(200).json({
      message: "Question deleted successfully",
      deletedQuestion: result.rows[0],
    });
  } catch (error) {
    console.error("Error deleting question:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// home data.........

export const homeApi = async (req, res) => {
  try {
    // Recent questions
    const { rows: recentQuestions } = await pool.query(
      `SELECT * 
       FROM questions
       WHERE created_at >= NOW() - INTERVAL '48 hours'
       ORDER BY created_at DESC`
    );

    // Recent forum posts with their files
    const { rows: recentPosts } = await pool.query(
      `SELECT fp.*,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', ff.id,
                    'url', ff.url,
                    'filename', ff.filename,
                    'created_at', ff.created_at
                  )
                ) FILTER (WHERE ff.id IS NOT NULL),
                '[]'
              ) AS files
       FROM forum_posts fp
       LEFT JOIN forum_files ff ON fp.id = ff.post_id
       WHERE fp.created_at >= NOW() - INTERVAL '48 hours'
       GROUP BY fp.id
       ORDER BY fp.created_at DESC`
    );

    return res.json({
      success: true,
      data: {
        questions: recentQuestions,
        forum_posts: recentPosts,
      },
    });
  } catch (error) {
    console.error("❌ Home API error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};


// user vote for the poll.......

// export const userVoteforpoll = async (req, res) => {
//   try {
//     const { poll_id, option_ids } = req.body; // option_ids should be array
//     const userId = req.userId;

//     if (!poll_id || !option_ids || option_ids.length === 0) {
//       return res.status(400).json({ message: "poll_id and option_ids required" });
//     }

//     // Check if poll allows multiple votes
//     const pollRes = await pool.query(`SELECT * FROM polls WHERE id = $1`, [poll_id]);
//     if (pollRes.rows.length === 0) return res.status(404).json({ message: "Poll not found" });

//     const poll = pollRes.rows[0];
//     if (!poll.allow_multiple && option_ids.length > 1) {
//       return res.status(400).json({ message: "This poll does not allow multiple votes" });
//     }

//     // Delete any previous votes if single choice
//     if (!poll.allow_multiple) {
//       await pool.query(`DELETE FROM poll_votes WHERE poll_id = $1 AND user_id = $2`, [
//         poll_id,
//         userId,
//       ]);
//     }

//     // Insert votes
//     for (let optId of option_ids) {
//       await pool.query(
//         `INSERT INTO poll_votes (poll_id, option_id, user_id) 
//          VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
//         [poll_id, optId, userId]
//       );
//     }

//     return res.json({ message: "Vote recorded successfully" });
//   } catch (error) {
//     console.error("userVoteforpoll error:", error);
//     return res.status(500).json({ message: "Internal server error" });
//   }
// };

export const userVoteforpoll = async (req, res) => {
  try {
    const { poll_id, option_ids } = req.body; // option_ids should be array
    const userId = req.userId;

    if (!poll_id || !option_ids || option_ids.length === 0) {
      return res.status(400).json({ message: "poll_id and option_ids required" });
    }

    // Check if poll allows multiple votes
    const pollRes = await pool.query(`SELECT * FROM polls WHERE id = $1`, [poll_id]);
    if (pollRes.rows.length === 0) return res.status(404).json({ message: "Poll not found" });

    const poll = pollRes.rows[0];
    if (!poll.allow_multiple && option_ids.length > 1) {
      return res.status(400).json({ message: "This poll does not allow multiple votes" });
    }

    // Always delete previous votes to allow vote changes
    await pool.query(`DELETE FROM poll_votes WHERE poll_id = $1 AND user_id = $2`, [
      poll_id,
      userId,
    ]);

    // Insert new votes
    for (let optId of option_ids) {
      await pool.query(
        `INSERT INTO poll_votes (poll_id, option_id, user_id) 
         VALUES ($1,$2,$3)`,
        [poll_id, optId, userId]
      );
    }

    return res.json({ message: "Vote recorded successfully" });
  } catch (error) {
    console.error("userVoteforpoll error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};