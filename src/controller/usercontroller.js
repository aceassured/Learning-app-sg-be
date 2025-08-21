// src/controller/usercontroller.js
import { findUserByEmail, findUserByPhone, createUser, updateUser, getUserById } from "../models/usermodels.js"
import dotenv from 'dotenv';
import jwt from "jsonwebtoken"
import pool from "../../database.js";
dotenv.config({ quiet: true });
import bcrypt from "bcrypt"
import crypto from "crypto";
import nodemailer from "nodemailer";


const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

export const login = async (req, res) => {
  try {
    const { email, phone } = req.body;
    let user = null;
    if (email) user = await findUserByEmail(email);
    if (!user && phone) user = await findUserByPhone(phone);

    if (user) {
      // existing user: return token + user data
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
      return res.json({ ok: true, user, token, redirect: 'home' });
    }

    // not found => redirect to register
    return res.json({ ok: false, message: 'Not found', redirect: 'register' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: 'Server error' });
  }
};

export const register = async (req, res) => {
  try {
    const { email, phone, name, grade_level, selected_subjects, daily_reminder_time, questions_per_day, school_name } = req.body;

    console.log(req.body)
    if (!grade_level || !selected_subjects || selected_subjects.length < 3 || !questions_per_day) {
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
      school_name
      
    });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

    return res.json({ status: true, message: 'Registered Successfully', user, token, redirect: 'home' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, message: 'Server error' });
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
    const updates = {...req.body};
    // handle file upload -> req.fileUrl if uploaded via router middleware
    if (req.fileUrl) updates.profile_photo_url = req.fileUrl;
    const updated = await updateUser(req.userId, updates);
    res.json({ ok: true, user: updated });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Server error' });
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
                { id: admin.id, role: "admin" },
                process.env.JWT_SECRET,
                { expiresIn: "1d" }
            );

            return res.json({ success: true, token, role: "admin", id: admin.id });
        }

        if (email || phone) {
            const field = email ? "email" : "phone";
            const value = email || phone;

            const { rows } = await pool.query(
                `SELECT id, email, phone FROM users WHERE ${field} = $1 LIMIT 1`,
                [value]
            );

            if (rows.length === 0) {
                return res.status(404).json({ success: false, message: "User not found" });
            }

            const user = rows[0];

            const token = jwt.sign(
                { userId: user.id, role: "user" },
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

        await pool.query("BEGIN"); // Start transaction

        const { rows: existing } = await pool.query(
            `SELECT id, email, phone FROM users WHERE email = $1 OR phone = $2 LIMIT 1`,
            [email || null, phone || null]
        );

        if (existing.length > 0) {
            const conflict = existing[0].email === email ? "Email" : "Phone";
            return res.status(409).json({
                success: false,
                message: `${conflict} already registered`,
            });
        }

        const { rows } = await pool.query(
            `INSERT INTO users 
       (email, phone, name, grade_level, questions_per_day, daily_reminder_time, selected_subjects, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
       RETURNING id, email, phone, name, grade_level, questions_per_day, daily_reminder_time, selected_subjects`,
            [
                email || null,
                phone || null,
                name || null,
                grade_level || null,
                questions_per_day || null,
                daily_reminder_time || null,
                selected_subjects || null,
            ]
        );

        const newUser = rows[0];

        await pool.query(
            `INSERT INTO users_settings (user_id,  created_at, updated_at)
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
            data: {
                user: newUser,
                token,
            },
        });
    } catch (error) {
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

// user edit.......

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
            sound_enabled
        } = req.body;

        let profilePhotoUrl;

        if (req.file && req.file.buffer) {
            const filename = `user_${userId}_${Date.now()}_${req.file.originalname}`;
            profilePhotoUrl = await uploadBufferToVercel(req.file.buffer, filename);
        }

        await pool.query("BEGIN");

        const userUpdateQuery = `
      UPDATE users 
      SET 
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        phone = COALESCE($3, phone),
        grade_level = COALESCE($4, grade_level),
        questions_per_day = COALESCE($5, questions_per_day),
        daily_reminder_time = COALESCE($6, daily_reminder_time),
        selected_subjects = COALESCE($7, selected_subjects),
        role = COALESCE($8, role),
        profile_photo_url = COALESCE($9, profile_photo_url),
        updated_at = NOW()
      WHERE id = $10
      RETURNING *;
    `;

        const userResult = await pool.query(userUpdateQuery, [
            name || null,
            email || null,
            phone || null,
            grade_level || null,
            questions_per_day || null,
            daily_reminder_time || null,
            selected_subjects ? selected_subjects : null,
            role || null,
            profilePhotoUrl || null,
            userId
        ]);

        if (userResult.rows.length === 0) {
            throw new Error("User not found");
        }

        // ✅ Update users_settings table (insert if not exists → UPSERT)
        const settingsUpdateQuery = `
      INSERT INTO users_settings 
        (user_id, questions_per_day, quiz_time_seconds, daily_reminder_time, reminder_enabled, dark_mode, sound_enabled, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
      ON CONFLICT (user_id) 
      DO UPDATE SET 
        questions_per_day = COALESCE(EXCLUDED.questions_per_day, users_settings.questions_per_day),
        quiz_time_seconds = COALESCE(EXCLUDED.quiz_time_seconds, users_settings.quiz_time_seconds),
        daily_reminder_time = COALESCE(EXCLUDED.daily_reminder_time, users_settings.daily_reminder_time),
        reminder_enabled = COALESCE(EXCLUDED.reminder_enabled, users_settings.reminder_enabled),
        dark_mode = COALESCE(EXCLUDED.dark_mode, users_settings.dark_mode),
        sound_enabled = COALESCE(EXCLUDED.sound_enabled, users_settings.sound_enabled),
        updated_at = NOW()
      RETURNING *;
    `;

        const settingsResult = await pool.query(settingsUpdateQuery, [
            userId,
            questions_per_day || null,
            quiz_time_seconds || null,
            daily_reminder_time || null,
            reminder_enabled !== undefined ? reminder_enabled : null,
            dark_mode !== undefined ? dark_mode : null,
            sound_enabled !== undefined ? sound_enabled : null
        ]);

        await pool.query("COMMIT");

        return res.status(200).json({
            ok: true,
            message: "User details updated successfully",
            user: userResult.rows[0],
            settings: settingsResult.rows[0]
        });

    } catch (error) {
        await pool.query("ROLLBACK");
        console.error("userEdit error:", error);
        return res.status(500).json({ ok: false, message: "Internal server error", error: error.message });
    } finally {
        pool.release();
    }
};

// admin register............

export const adminRegister = async (req, res) => {

    try {
        const { email, password, name } = req.body;

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
       (email, password, name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
            [email, hashedPassword, name || null, "admin"]
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

    const now = new Date();
    if (now > admin.otp_expire_time) {
      return res.status(400).json({
        success: false,
        message: "OTP expired",
      });
    }

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