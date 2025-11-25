import { findUserByEmail, findUserByPhone, createUser, updateUser, getUserById, updateUserSettings, createUsernew } from "../models/usermodels.js"
import dotenv from 'dotenv';
import jwt from "jsonwebtoken"
import pool from "../../database.js";
dotenv.config({ quiet: true });
import bcrypt from "bcrypt"
import crypto from "crypto";
import nodemailer from "nodemailer";
import { uploadBufferToVercel } from "../utils/vercel-blob.js";
import { NotificationService } from "../services/notificationService.js";
import { SendMailClient } from "zeptomail";


import { generateRegistrationOptions } from '@simplewebauthn/server';
import { TextEncoder } from 'util';
import base64url from 'base64url';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';

import { isoBase64URL } from '@simplewebauthn/server/helpers';



const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

const ORIGIN = process.env.NODE_ENV === 'development'
  ? 'http://localhost:5173'
  : 'https://ace-hive-production-fe.vercel.app';
const RP_ID = process.env.NODE_ENV === 'development'
  ? 'localhost'
  : 'ace-hive-production-fe.vercel.app';
const RP_NAME = 'AceHive';

// Helper functions with EXTRA validation
const bufferToBase64url = (buffer) => {
  if (!buffer) {
    throw new Error('Buffer is required for base64url conversion');
  }
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
};

const base64urlToBuffer = (base64url) => {
  // CRITICAL: Convert to string if it's not already
  const input = typeof base64url === 'string' ? base64url : String(base64url);

  if (!input || input === 'null' || input === 'undefined') {
    throw new Error(`Invalid base64url input: empty or null`);
  }

  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const paddedBase64 = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    '='
  );
  return Buffer.from(paddedBase64, 'base64');
};


//Getting all allowed origins
const getAllowedOrigins = () => {
  const origins = process.env.ALLOWED_ORIGINS
  if (!origins) {
    // Fallback for safety, but you should have the variable set
    return [this.config.get < string > ('ORIGIN') ?? 'http://localhost:5173'];
  }
  // This splits the comma-separated string from your .env into an array
  return origins.split(',');
}


// // FIXED: Proper user ID buffer generation
// const generateUserIdBuffer = (userId) => {
//   const userIdString = userId.toString();
//   return isoBase64URL.toBuffer(isoBase64URL.fromUTF8String(userIdString));
// };


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


// export const Commonlogin = async (req, res) => {
//   try {
//     const { email, password } = req.body;

//     if (!email || !password) {
//       return res.status(400).json({ status: false, message: "Email and password are required" });
//     }

//     // ✅ Fetch user with grade join
//     const { rows } = await pool.query(
//       `SELECT 
//          u.*,
//          g.grade_level AS grade_value,
//          us.quiz_time_seconds
//        FROM users u
//        LEFT JOIN grades g ON g.id = u.grade_id
//        LEFT JOIN user_settings us ON us.user_id = u.id
//        WHERE u.email = $1`,
//       [email]
//     );

//     const user = rows[0];
//     if (!user) {
//       return res.status(401).json({
//         status: false,
//         message: "User not found. Please sign up to continue.",
//       });
//     }

//     // ✅ Compare password with hashed password
//     const isMatch = await bcrypt.compare(password, user.password);
//     if (!isMatch) {
//       return res.status(401).json({ status: false, message: "Invalid credentials" });
//     }

//     // ✅ Fetch subject details only if selected_subjects exist
//     let selectedSubjectsNames = [];
//     if (user.selected_subjects && user.selected_subjects.length > 0) {
//       const { rows: subjectRows } = await pool.query(
//         `SELECT id, icon, subject 
//          FROM subjects 
//          WHERE id = ANY($1::int[])`,
//         [user.selected_subjects.map(Number)]
//       );
//       selectedSubjectsNames = subjectRows.map((r) => ({
//         id: r.id,
//         subject: r.subject,
//         icon: r.icon,
//       }));
//     }

//     // ✅ Generate JWT token
//     const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });

//     // 🎯 Generate smart notifications after successful login
//     // Run in background to avoid delaying login response
//     setTimeout(async () => {
//       try {
//         await NotificationService.generateLoginNotifications(user.id);
//       } catch (error) {
//         console.error("Error generating login notifications:", error);
//       }
//     }, 3000); // 1 second delay

//     // ✅ Return response without password
//     const { password: _, ...userData } = user;

//     return res.json({
//       status: true,
//       data: {
//         ...userData,
//         selected_subjects: selectedSubjectsNames,
//         grade_value: user.grade_value || null, // return grade_level name
//       },
//       token,
//     });
//   } catch (err) {
//     console.error("Login error:", err);
//     res.status(500).json({ status: false, message: "Server error" });
//   }
// };


// Helper to convert browser credential format to server format


// In your backend userController.js or userrouter.js

export const Commonlogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ status: false, message: "Email and password are required" });
    }

    // Fetch user with grade join
    const { rows } = await pool.query(
      `SELECT 
         u.*,
         g.grade_level AS grade_value,
         us.quiz_time_seconds
       FROM users u
       LEFT JOIN grades g ON g.id = u.grade_id
       LEFT JOIN user_settings us ON us.user_id = u.id
       WHERE u.email = $1`,
      [email]
    );

    const user = rows[0];
    if (!user) {
      return res.status(401).json({
        status: false,
        message: "User not found. Please sign up to continue.",
      });
    }

    // Compare password with hashed password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ status: false, message: "Invalid credentials" });
    }

    // Fetch subject details only if selected_subjects exist
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

    // Generate JWT token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });

    // ✅ CRITICAL: Generate and send notifications BEFORE returning response
    // This ensures notifications are sent immediately on login
    try {
      console.log(`🔔 Generating login notifications for user ${user.id}`);

      // Generate all notification types
      await NotificationService.generateLoginNotifications(user.id);

      // ✅ Send notifications via Firebase if user has FCM token
      if (user.fcm_token) {
        const notificationsResult = await pool.query(
          `SELECT id, message, type, subject 
           FROM notifications 
           WHERE user_id = $1 
           AND created_at >= NOW() - INTERVAL '10 seconds'
           ORDER BY created_at DESC 
           LIMIT 1`,
          [user.id]
        );

        if (notificationsResult.rows.length > 0) {
          const latestNotif = notificationsResult.rows[0];

          // Send via Firebase push notification
          const { sendPushNotification } = await import('../config/firebaseAdmin.js');

          await sendPushNotification(user.fcm_token, {
            title: 'Acehive',
            message: latestNotif.message,
            type: latestNotif.type,
            subject: latestNotif.subject,
            url: '/notifications',
          });

          console.log(`✅ Firebase notification sent to user ${user.id}`);
        }
      }
    } catch (error) {
      console.error("❌ Error generating/sending login notifications:", error);
      // Don't fail login if notifications fail
    }

    // Return response without password
    const { password: _, ...userData } = user;

    return res.json({
      status: true,
      data: {
        ...userData,
        selected_subjects: selectedSubjectsNames,
        grade_value: user.grade_value || null,
      },
      token,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ status: false, message: "Server error" });
  }
};

const convertCredentialForVerification = (credential) => {
  return {
    id: credential.id,
    rawId: credential.rawId,
    type: credential.type,
    response: {
      clientDataJSON: credential.response.clientDataJSON,
      attestationObject: credential.response.attestationObject,
      // Include transports if available
      transports: credential.response.transports || [],
    },
    clientExtensionResults: credential.clientExtensionResults || {},
    authenticatorAttachment: credential.authenticatorAttachment,
  };
};


export const generateBiometricRegistration = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email required' });

    const { rows } = await pool.query(
      `SELECT id, email, name FROM users WHERE email=$1`,
      [email]
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: 'User not found' });
    const user = rows[0];

    // Find any existing credentials for this user
    const { rows: existingCreds } = await pool.query(
      `SELECT credential_id FROM webauthn_credentials WHERE user_id=$1`,
      [user.id]
    );

    const excludeCredentials = existingCreds.map(cred => ({
      id: isoBase64URL.toBuffer(cred.credential_id),
      type: 'public-key',
    }));

    const options = await generateRegistrationOptions({
      rpName: process.env.RP_NAME,
      rpID: process.env.RP_ID,
      userID: Buffer.from(String(user.id)), // CHANGE: Simplified buffer creation
      userName: user.email,
      userDisplayName: user.name || user.email,

      // CHANGE: Added pubKeyCredParams to match creator's code. This is crucial.
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },  // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],

      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required',
        authenticatorAttachment: 'platform',
      },
      excludeCredentials, // Use the dynamically fetched list
    });

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await pool.query(
      `INSERT INTO webauthn_challenges (user_id, purpose, challenge, expires_at)
       VALUES ($1, 'register', $2, $3)`,
      [user.id, options.challenge, expiresAt]
    );



    res.json({ success: true, options });
  } catch (err) {
    console.error('Error in generateBiometricRegistration:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const verifyBiometricRegistration = async (req, res) => {
  try {
    const { email, credential } = req.body;
    if (!email || !credential)
      return res.status(400).json({ success: false, message: 'Missing data' });

    const { rows: userRows } = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    if (!userRows[0]) return res.status(404).json({ success: false, message: 'User not found' });
    const user = userRows[0];

    const { rows: challengeRows } = await pool.query(
      `SELECT * FROM webauthn_challenges
       WHERE user_id=$1 AND purpose='register'
       ORDER BY created_at DESC
       LIMIT 1`,
      [user.id]
    );
    if (!challengeRows[0])
      return res.status(400).json({ success: false, message: 'No registration challenge found' });

    const expectedChallenge = challengeRows[0].challenge;

    let verification;
    try {
      // CHANGE: We now use the origin directly from the request header for a perfect match.
      const expectedOrigin = req.headers.origin;
      if (!expectedOrigin) {
        return res.status(400).json({ success: false, message: 'Request origin is missing.' });
      }

      verification = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge,
        expectedOrigin, // Use the origin from the current request
        expectedRPID: process.env.RP_ID,
        requireUserVerification: false,
      });
    } catch (err) {
      console.error('Verification library error:', err);
      // Provide a more detailed error to the client for debugging
      return res.status(400).json({ success: false, message: `Verification failed: ${err.message}` });
    }

    const { verified, registrationInfo } = verification;
    if (!verified || !registrationInfo)
      return res.status(400).json({ success: false, message: 'Could not verify registration.' });

    // With a successful verification, these values will now be defined.
    const { id, publicKey, counter } = registrationInfo.credential;

    const credentialPublicKey = isoBase64URL.fromBuffer(publicKey);


    // 🧹 Delete any old credentials for this user to prevent duplicates
    await pool.query(`DELETE FROM webauthn_credentials WHERE user_id=$1`, [user.id]);

    // ✅ Insert the new credential (latest)
    await pool.query(
      `INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter)
   VALUES ($1, $2, $3, $4)`,
      [user.id, id, credentialPublicKey, counter || 0]
    );

    // 🔹 Update the user's biometric_enabled status
    await pool.query(
      `UPDATE users SET biometric_enabled = true WHERE id = $1`,
      [user.id]
    );

    await pool.query(`DELETE FROM webauthn_challenges WHERE id=$1`, [challengeRows[0].id]);

    // Clean up expired challenges
    await pool.query(`DELETE FROM webauthn_challenges WHERE expires_at < NOW()`);

    res.json({ success: true, message: 'Biometric enabled' });
  } catch (err) {
    console.error('Error in verifyBiometricRegistration:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const generateBiometricAuth = async (req, res) => {
  try {
    // 1️⃣ Get all registered credentials
    const { rows: credentials } = await pool.query(
      `SELECT credential_id, transports FROM webauthn_credentials`
    );

    if (credentials.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'No passkeys have been registered yet.' });
    }

    // 2️⃣ Map them into allowCredentials
    const allowCredentials = credentials.map((cred) => ({
      id: cred.credential_id, // already stored as base64url string
      type: 'public-key',
      transports: cred.transports?.length > 0 ? cred.transports : ['internal'],
    }));

    const options = await generateAuthenticationOptions({
      rpID: process.env.RP_ID,
      allowCredentials,
      userVerification: 'preferred',
      // CHANGE: Removed allowCredentials. This is the modern "passkey" approach
      // where the browser/OS finds the resident keys on its own.
    });

    await pool.query(
      `INSERT INTO webauthn_challenges (purpose, challenge, expires_at)
       VALUES ('login', $1, NOW() + INTERVAL '5 minutes')`,
      [options.challenge]
    );

    return res.json({ success: true, options });
  } catch (err) {
    console.error('Error generating biometric login options:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const bioMetricLogin = async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ success: false, message: 'Missing credential' });
    }

    const { rows: challengeRows } = await pool.query(
      `SELECT * FROM webauthn_challenges WHERE purpose='login' ORDER BY created_at DESC LIMIT 1`
    );
    if (challengeRows.length === 0) {
      return res.status(400).json({ success: false, message: 'No challenge found' });
    }
    const challenge = challengeRows[0];

    const credentialIdToSearch = credential.rawId || credential.id;

    const { rows: credRows } = await pool.query(
      `SELECT wc.*, u.id as user_id, u.email 
       FROM webauthn_credentials wc 
       JOIN users u ON wc.user_id = u.id 
       WHERE wc.credential_id=$1`,
      [credentialIdToSearch]
    );


    if (credRows.length === 0) {
      return res.status(400).json({ success: false, message: 'Authenticator not found' });
    }
    const dbCred = credRows[0];

    const credentialPublicKey = isoBase64URL.toBuffer(
      Buffer.isBuffer(dbCred.public_key)
        ? dbCred.public_key.toString('utf8')
        : dbCred.public_key
    );

    const authenticator = {
      id: dbCred.credential_id,
      publicKey: credentialPublicKey,
      counter: dbCred.counter,
      transports: dbCred.transports || [],
    };

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: credential,
        expectedChallenge: challenge.challenge,
        expectedOrigin: req.headers.origin,
        expectedRPID: process.env.RP_ID,
        credential: authenticator,
        requireUserVerification: false, // To be consistent with creator's code
      });
    } catch (err) {
      console.error('❌ Verification error:', err);
      return res.status(401).json({ success: false, message: err.message });
    }


    // ... The rest of your function from here on is correct.
    const { verified, authenticationInfo } = verification;

    if (!verified || !authenticationInfo) {
      return res.status(401).json({ success: false, message: 'Biometric login failed' });
    }

    if (authenticationInfo.newCounter !== 0 && authenticationInfo.newCounter <= dbCred.counter) {
      return res.status(400).json({
        success: false,
        message: 'Authenticator counter did not increase. Possible cloned device detected.'
      });
    }

    await pool.query(
      `UPDATE webauthn_credentials SET counter=$1 WHERE id=$2`,
      [authenticationInfo.newCounter, dbCred.id]
    );

    await pool.query(
      `UPDATE webauthn_challenges SET user_id=$1 WHERE id=$2`,
      [dbCred.user_id, challenge.id]
    );

    // 8️⃣ Issue JWT
    const token = jwt.sign(
      { userId: dbCred.user_id, email: dbCred.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Fetch full user info
    const { rows } = await pool.query(
      `SELECT 
         u.*, 
         g.grade_level AS grade_value, 
         us.quiz_time_seconds
       FROM users u
       LEFT JOIN grades g ON g.id = u.grade_id
       LEFT JOIN user_settings us ON us.user_id = u.id
       WHERE u.id = $1`,
      [dbCred.user_id]
    );

    const user = rows[0];
    if (!user) {
      return res.status(404).json({ status: false, message: "User not found" });
    }

    // Fetch selected subjects
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

    // Trigger notifications in background
    setTimeout(async () => {
      try {
        await NotificationService.generateLoginNotifications(user.id);
      } catch (error) {
        console.error("Error generating login notifications:", error);
      }
    }, 1000);

    // Clean up expired challenges
    await pool.query(`DELETE FROM webauthn_challenges WHERE expires_at < NOW()`);

    // Exclude password and return
    const { password: _, ...userData } = user;

    return res.json({
      status: true,
      data: {
        ...userData,
        selected_subjects: selectedSubjectsNames,
        grade_value: user.grade_value || null,
      },
      token,
    });

  } catch (err) {
    console.error('Error in biometric login:', err);
    return res.status(500).json({ status: false, message: 'Internal server error' });
  }
};

export const removeBiometricCrendentials = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate input
    if (!id) {
      return res.status(400).json({
        status: false,
        message: "Credential ID is required",
      });
    }

    // Delete the credential by ID
    const result = await pool.query(
      "DELETE FROM webauthn_credentials WHERE user_id = $1 RETURNING *",
      [id]
    );

    // If no rows were deleted, credential not found
    if (result.rowCount === 0) {
      return res.status(404).json({
        status: false,
        message: "Biometric credential not found",
      });
    }

    // 🔹 Update the user's biometric_enabled status
    await pool.query(
      `UPDATE users SET biometric_enabled = false WHERE id = $1`,
      [id]
    );

    // Successful deletion
    return res.status(200).json({
      status: true,
      message: "Biometric credential removed successfully",
      deletedCredential: result.rows[0],
    });
  } catch (err) {
    console.error("Error in removeBiometricCrendentials:", err);
    return res
      .status(500)
      .json({ status: false, message: "Internal server error" });
  }
};

export const cleanupBiometricRecords = async (req, res) => {
  try {
    const result = await pool.query(`
      UPDATE users SET 
        biometric_challenge = NULL,
        biometric_credential_id = NULL,
        biometric_public_key = NULL,
        biometric_counter = 0,
        biometric_enabled = FALSE
      WHERE (biometric_enabled = FALSE AND biometric_challenge IS NOT NULL)
         OR (biometric_enabled = TRUE AND biometric_credential_id IS NULL)
    `);

    res.json({
      success: true,
      message: `Cleaned up ${result.rowCount} records`
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
// Database schema validation function (run this to ensure your DB is set up correctly)
export const validateBiometricSchema = async () => {
  try {
    const schemaQueries = [
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS biometric_credential_id BYTEA;`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS biometric_public_key BYTEA;`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS biometric_counter INTEGER DEFAULT 0;`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS biometric_challenge TEXT;`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS biometric_enabled BOOLEAN DEFAULT FALSE;`,
      `CREATE INDEX IF NOT EXISTS idx_users_biometric_credential_id ON users(biometric_credential_id);`,
      `CREATE INDEX IF NOT EXISTS idx_users_biometric_enabled ON users(biometric_enabled);`
    ];

    for (const query of schemaQueries) {
      await pool.query(query);
    }

    console.log('Biometric database schema validated successfully');
  } catch (error) {
    console.error('Error validating biometric schema:', error);
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


const client = new SendMailClient({
  url: 'api.zeptomail.in/',
  token: "Zoho-enczapikey PHtE6r1cEbzi3TYt8kNSsfWxEMahNI99+elvKlZFstsXA/MEGk0D+d0ukmLlrBp/UaZGRvPNzd5rtL3PsejXc2bpMm9MCmqyqK3sx/VYSPOZsbq6x00fs1kdfkDVXYHucNBq3SzfvNvbNA=="

});

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

    // // ✅ Setup nodemailer
    // const transporter = nodemailer.createTransport({
    //   service: "gmail", // or other provider
    //   auth: {
    //     user: process.env.EMAIL_USER,
    //     pass: process.env.EMAIL_PASS,
    //   },
    // });

    // // ✅ Send OTP email
    // await transporter.sendMail({
    //   from: process.env.EMAIL_USER,
    //   to: email,
    //   subject: "Your OTP Code",
    //   text: `Your OTP code is ${otp}. It is valid for 10 minutes.`,
    // });

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
if (parseInt(user.otp) !== parseInt(otp)) {
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


// update grade and subject........

// export const updateGradesubject = async (req, res) => {
//   try {
//     const {
//       email,
//       grade_level,
//       selected_subjects,
//       grade_id,
//     } = req.body;

//     if (!email) {
//       return res.status(400).json({ status: false, message: "Email is required" });
//     }

//     // ✅ Validate required fields
//     if (!grade_level || !selected_subjects || selected_subjects.length < 3 || !grade_id) {
//       return res.status(400).json({
//         status: false,
//         message: "Missing or invalid fields. Select minimum 3 subjects."
//       });
//     }


//     // ✅ Update user in DB
//     const userRes = await pool.query(
//       `UPDATE users 
//        SET grade_level = $1, 
//            selected_subjects = $2, 
//            grade_id = $3
//        WHERE email = $4
//        RETURNING id, email, name, grade_level, selected_subjects, grade_id, daily_reminder_time, questions_per_day, school_name, phone`,
//       [
//         grade_level,
//         selected_subjects,
//         grade_id,
//         email
//       ]
//     );

//     if (userRes.rows.length === 0) {
//       return res.status(404).json({ status: false, message: "User not found" });
//     }

//     const user = userRes.rows[0];

//     const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });

//     return res.json({
//       status: true,
//       message: "User updated successfully",
//       user,
//       token,
//       redirect: "home"
//     });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ status: false, message: "Server error" });
//   }
// };


export const getProfile = async (req, res) => {
  try {
    const user = await getUserById(req.userId);
    res.json({ ok: true, user });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Server error' });
  }
};


export const getSubjectsByIds = async (subjectIds) => {
  if (!subjectIds || subjectIds.length === 0) return [];

  const query = `
    SELECT id, subject, icon
    FROM subjects
    WHERE id = ANY($1::int[])
  `;
  const { rows } = await pool.query(query, [subjectIds.map(Number)]);
  return rows;
};


export const editProfile = async (req, res) => {
  try {
    const updates = { ...req.body };
    if (req.fileUrl) updates.profile_photo_url = req.fileUrl;

    const userFields = {};
    const settingsFields = {};

    if (updates.name !== undefined) userFields.name = updates.name;
    if (updates.school_name !== undefined) userFields.school_name = updates.school_name;
    if (updates.grade_level !== undefined) userFields.grade_level = parseInt(updates.grade_level, 10);
    if (updates.grade_id !== undefined) userFields.grade_id = parseInt(updates.grade_id, 10);
    if (updates.questions_per_day !== undefined)
      userFields.questions_per_day = parseInt(updates.questions_per_day, 10);
    if (updates.selected_subjects !== undefined)
      userFields.selected_subjects = updates.selected_subjects.map(Number);
    if (updates.profile_photo_url !== undefined)
      userFields.profile_photo_url = updates.profile_photo_url;

    if (updates.study_reminder !== undefined)
      settingsFields.study_reminder = updates.study_reminder === "true" || updates.study_reminder === true;

    if (updates.forum_update !== undefined)
      settingsFields.forum_update = updates.forum_update === "true" || updates.forum_update === true;

    let updatedUser = null;
    if (Object.keys(userFields).length > 0) {
      updatedUser = await updateUser(req.userId, userFields);
    }

    let updatedSettings = null;
    if (Object.keys(settingsFields).length > 0) {
      updatedSettings = await updateUserSettings(req.userId, settingsFields);
    }

    // ✅ Fetch full subject details
    let detailedSubjects = [];
    if (updatedUser?.selected_subjects?.length > 0) {
      detailedSubjects = await getSubjectsByIds(updatedUser.selected_subjects);
    }

    // ✅ Replace raw subject IDs with full objects
    if (updatedUser) updatedUser.selected_subjects = detailedSubjects;

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
      `INSERT INTO user_settings (user_id)
       VALUES ($1)`,
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

    // Try fetching from admins first
    const adminResult = await pool.query(
      `SELECT *, 'Admin' AS user_type FROM admins WHERE id = $1`,
      [userId]
    );

    // If not found, try fetching from superadmin
    const user =
      adminResult.rows[0] ||
      (
        await pool.query(
          `SELECT *, 'Superadmin' AS user_type FROM superadmin WHERE id = $1`,
          [userId]
        )
      ).rows[0];

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found in both tables",
      });
    }

    return res.status(200).json({
      success: true,
      message: `${user.user_type} details fetched successfully`,
      data: user,
    });
  } catch (error) {
    console.error("❌ Get admin/superadmin details error:", error);

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
    if (grade_level !== undefined) {
      userFields.push(`grade_id = $${paramIndex++}`);
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

export const superadminRegister = async (req, res) => {

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
      `SELECT id FROM superadmin WHERE email = $1`,
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
      `INSERT INTO superadmin 
       (email, password, name, phone, department, employee_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING *`,
      [email, hashedPassword, name || null, phone, department, employee_id]
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
      message: "Super Admin registered successfully",
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
  const upper = base.charAt(0)?.toUpperCase();
  const randomNum = Math.floor(1000 + Math.random() * 9000); // 4-digit number
  const specialChars = "!@#$%^&*";
  const special = specialChars?.charAt(Math.floor(Math.random() * specialChars.length));

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

    // ✅ Check for duplicate email in both tables
    const { rows: existingAdmins } = await client.query(
      "SELECT id FROM admins WHERE email = $1",
      [email]
    );
    const { rows: existingUsers } = await client.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    const { rows: existingSuperAdmin } = await client.query(
      "SELECT id FROM superadmin WHERE email = $1",
      [email]
    );


    if (existingAdmins.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: "Email already registered as Admin",
      });
    }

    if (existingUsers.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: "Email already registered as Student",
      });
    }

    if (existingSuperAdmin.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: "Email already registered as Superadmin",
      });
    }


    // ✅ Generate and hash password
    const plainPassword = generatePassword(name);
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    let insertQuery = "";
    let values = [];
    let insertedUser = null;

    // ✅ Insert based on role
    if (role === "Admin") {
      insertQuery = `
        INSERT INTO admins (name, email, role, password, created_at)
        VALUES ($1, $2, $3, $4, NOW())
        RETURNING id, name, email, role, created_at
      `;
      values = [name, email, role, hashedPassword];
    } else if (role === "Student") {
      insertQuery = `
        INSERT INTO users (name, email, role, password, created_at)
        VALUES ($1, $2, $3, $4, NOW())
        RETURNING id, name, email, role, created_at
      `;
      values = [name, email, role, hashedPassword];
    } else {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Invalid role provided",
      });
    }

    const { rows } = await client.query(insertQuery, values);
    insertedUser = rows[0];

    await client.query("COMMIT");

    // ✅ Send email with credentials
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: `"Admin Panel" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Your Account Credentials",
      text: `Hello ${name},

Your ${role} account has been created successfully.

Login Credentials:
Email: ${email}
Password: ${plainPassword}

Please login and change your password after first login.

Best regards,
Team`,
    });

    return res.status(201).json({
      success: true,
      message: `${role} created successfully. Credentials sent via email.`,
      data: insertedUser,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Add new user error:", error);
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
    const search = req.query.search?.trim() || "";
    const role = req.query.role?.toLowerCase() || "all"; // 'admin', 'user', or 'all'
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit) || 10, 1);
    const offset = (page - 1) * limit;

    // Dynamic search condition
    const searchCondition = search
      ? `WHERE LOWER(name) LIKE LOWER($1) OR LOWER(email) LIKE LOWER($1)`
      : "";

    const params = search ? [`%${search}%`] : [];

    // Build base query depending on role
    let baseQuery = "";
    if (role === "admin") {
      baseQuery = `
        SELECT id, name, email, 'admin' AS role, created_at, profile_photo_url, active_status, is_active_request
        FROM admins
        ${searchCondition}
      `;
    } else if (role === "user") {
      baseQuery = `
        SELECT id, name, email, 'user' AS role, created_at, profile_photo_url, active_status, is_active_request
        FROM users
        ${searchCondition}
      `;
    } else {
      // all users (admin + user)
      baseQuery = `
        SELECT id, name, email, 'admin' AS role, created_at, profile_photo_url, active_status, is_active_request
        FROM admins
        ${searchCondition}
        UNION ALL
        SELECT id, name, email, 'user' AS role, created_at, profile_photo_url, active_status, is_active_request
        FROM users
        ${searchCondition ? "WHERE LOWER(name) LIKE LOWER($1) OR LOWER(email) LIKE LOWER($1)" : ""}
      `;
    }

    // Count total users
    const countQuery = `SELECT COUNT(*) AS total FROM (${baseQuery}) AS combined`;
    const { rows: countRows } = await client.query(countQuery, params);
    const total = parseInt(countRows[0]?.total || 0, 10);

    // Paginated query
    const limitIndex = search ? 2 : 1;
    const offsetIndex = search ? 3 : 2;

    const dataQuery = `
      ${baseQuery}
      ORDER BY created_at DESC
      LIMIT $${limitIndex} OFFSET $${offsetIndex}
    `;

    const queryParams = search ? [params[0], limit, offset] : [limit, offset];
    const { rows: users } = await client.query(dataQuery, queryParams);

    return res.status(200).json({
      success: true,
      data: users,
      pagination: {
        total,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        perPage: limit,
      },
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




export const getAllSubjectnew = async (req, res) => {
  const { grade_id, search } = req.body; // ✅ added search

  const client = await pool.connect();
  try {
    let query = `
      SELECT s.*, g.grade_level
      FROM subjects s
      JOIN grades g ON s.grade_id = g.id
      WHERE s.grade_id = $1
    `;
    const values = [grade_id];

    if (search) {
      query += ` AND s.subject ILIKE $2`;
      values.push(`%${search}%`);
    }

    query += ` ORDER BY s.subject ASC`;

    const { rows: allSubjects } = await client.query(query, values);

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


export const getAllSubject = async (req, res) => {
  const client = await pool.connect();
  try {
    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    let whereClause = "WHERE active_status != false";
    let values = [];
    let countValues = [];

    if (search) {
      whereClause += " AND LOWER(subject) LIKE LOWER($1)";
      values = [`%${search}%`, limit, offset];
      countValues = [`%${search}%`];
    } else {
      values = [limit, offset];
    }

    const countQuery = `SELECT COUNT(*) AS total FROM subjects ${whereClause}`;
    const dataQuery = `
      SELECT * FROM subjects
      ${whereClause}
      ORDER BY subject ASC
      LIMIT $${search ? 2 : 1} OFFSET $${search ? 3 : 2}
    `;

    const { rows: countResult } = await client.query(countQuery, countValues);
    const total = parseInt(countResult[0].total);

    const { rows: allSubjects } = await client.query(dataQuery, values);

    return res.status(200).json({
      success: true,
      data: allSubjects,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get subjects error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  } finally {
    client.release();
  }
};



export const getAllTopic = async (req, res) => {
  const client = await pool.connect();
  try {
    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    let whereClause = "WHERE active_status != false";
    let values = [];
    let countValues = [];

    if (search) {
      whereClause += " AND LOWER(topic) LIKE LOWER($1)";
      values = [`%${search}%`, limit, offset];
      countValues = [`%${search}%`];
    } else {
      values = [limit, offset];
    }

    const countQuery = `SELECT COUNT(*) AS total FROM topics ${whereClause}`;
    const dataQuery = `
      SELECT * FROM topics
      ${whereClause}
      ORDER BY topic ASC
      LIMIT $${search ? 2 : 1} OFFSET $${search ? 3 : 2}
    `;

    const { rows: countResult } = await client.query(countQuery, countValues);
    const total = parseInt(countResult[0].total);

    const { rows: allTopics } = await client.query(dataQuery, values);

    return res.status(200).json({
      success: true,
      data: allTopics,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get topics error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  } finally {
    client.release();
  }
};



export const getAllGrade = async (req, res) => {
  const client = await pool.connect();
  try {
    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    let whereClause = "WHERE active_status != false";
    let values = [];
    let countValues = [];

    if (search) {
      whereClause +=
        " AND (CAST(grade_level AS TEXT) ILIKE $1 OR LOWER(grade_level) LIKE LOWER($1))";
      values = [`%${search}%`, limit, offset];
      countValues = [`%${search}%`];
    } else {
      values = [limit, offset];
    }

    const countQuery = `SELECT COUNT(*) AS total FROM grades ${whereClause}`;
    const dataQuery = `
      SELECT * FROM grades
      ${whereClause}
      ORDER BY grade_level ASC
      LIMIT $${search ? 2 : 1} OFFSET $${search ? 3 : 2}
    `;

    const { rows: countResult } = await client.query(countQuery, countValues);
    const total = parseInt(countResult[0].total);

    const { rows: allGrades } = await client.query(dataQuery, values);

    return res.status(200).json({
      success: true,
      data: allGrades,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get grades error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  } finally {
    client.release();
  }
};





// admin edit...

export const adminEdit = async (req, res) => {
  try {
    const adminId = req.userId;
    const { name, email, phone } = req.body;

    if (!adminId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    // First, check if user exists in admins
    let userType = "admin";
    let existingUser = (
      await pool.query(`SELECT * FROM admins WHERE id = $1`, [adminId])
    ).rows[0];

    // If not found, check in superadmin table
    if (!existingUser) {
      const superAdminResult = await pool.query(
        `SELECT * FROM superadmin WHERE id = $1`,
        [adminId]
      );
      if (superAdminResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }
      userType = "superadmin";
      existingUser = superAdminResult.rows[0];
    }

    // Handle profile photo upload
    let profilePhotoUrl = existingUser.profile_photo_url;
    if (req.file) {
      const file = req.file;
      profilePhotoUrl = await uploadBufferToVercel(file.buffer, file.originalname);
    }

    // Build dynamic table name
    const tableName = userType === "superadmin" ? "superadmin" : "admins";

    // Update query
    const { rows } = await pool.query(
      `UPDATE ${tableName}
       SET 
         name = COALESCE($1, name),
         email = COALESCE($2, email),
         phone = COALESCE($3, phone),
         profile_photo_url = COALESCE($4, profile_photo_url),
         updated_at = NOW()
       WHERE id = $5
       RETURNING id, name, email, phone, profile_photo_url, role, created_at, updated_at`,
      [name || null, email || null, phone || null, profilePhotoUrl || null, adminId]
    );

    return res.status(200).json({
      success: true,
      message: `${userType === "superadmin" ? "Super Admin" : "Admin"} updated successfully`,
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
      grade_id,   // grade_id
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
      !grade_id
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
      [grade_id]
    );
    if (gradeRes.rowCount === 0) {
      return res.status(400).json({ message: "Invalid grade id" });
    }
    // const gradeLevelName = gradeRes.rows[0].grade_level;

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
      (subject, question_text, options, correct_option_id, created_at, difficulty_level, grade_id, question_type, question_url, topic_id, answer_explanation, answer_file_url, topics, subject_id) 
      VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *;
    `;

    const values = [
      subjectName,                   // subject (string from subjects table)
      question_text,
      JSON.stringify(parsedOptions),
      correct_option_id,
      difficulty_level || "Easy",
      grade_id,                // grade_level (string from grades table)
      question_type,
      questionFileUrl,               // question file
      topics,                        // topic_id (FK)
      answer_explanation,
      answerFileUrl,
      topicName,
      category             // answer file
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


export const getAllquestionsSearch = async (req, res) => {
  try {
    let { search = "", page = 1, limit = 10 } = req.query;

    page = Number(page);
    limit = Number(limit);
    const offset = (page - 1) * limit;

    let totalQuery = "SELECT COUNT(*) FROM questions";
    let dataQuery = `
      SELECT * FROM questions
    `;
    let values = [];

    if (search) {
      // If search exists, add WHERE clause
      totalQuery += `
        WHERE question_text ILIKE $1
          OR grade_level ILIKE $1
          OR subject ILIKE $1
          OR topics ILIKE $1
      `;
      dataQuery += `
        WHERE question_text ILIKE $1
          OR grade_level ILIKE $1
          OR subject ILIKE $1
          OR topics ILIKE $1
      `;
      values.push(`%${search}%`);
    }

    // Add pagination
    dataQuery += `
      ORDER BY created_at DESC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
    `;
    values.push(limit, offset);

    // Get total
    const totalResult = await pool.query(totalQuery, search ? [`%${search}%`] : []);
    const total = parseInt(totalResult.rows[0].count, 10);

    const result = await pool.query(dataQuery, values);

    return res.status(200).json({
      message: "Questions fetched successfully",
      total,
      page,
      totalPages: Math.ceil(total / limit),
      questions: result.rows,
    });
  } catch (error) {
    console.error("Error fetching questions:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};



export const getParticularquestions = async (req, res) => {
  try {
    const { question_id } = req.body

    const query = `SELECT * FROM questions WHERE id = $1;`;
    const result = await pool.query(query, [question_id]);

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

// // social login check...........


// export const socialLogincheck = async (req, res) => {
//   try {
//     const { email, social_id, provider } = req.body;

//     const userResult = await pool.query(
//       `SELECT * FROM users WHERE email = $1 AND social_id = $2 AND provider = $3 LIMIT 1`,
//       [email, social_id, provider]
//     );

//     // ✅ Check if user exists with regular email (non-social login)
//     const emailUserResult = await pool.query(
//       `SELECT * FROM users WHERE email = $1 AND (provider IS NULL OR provider = 'local') LIMIT 1`,
//       [email]
//     );

//     const user = userResult.rows[0];
//     const emailUser = emailUserResult.rows[0];

//     res.json({
//       exists: !!user,
//       emailExists: !!emailUser,
//       message: user ? "User exists" : "User not found",
//     });
//   } catch (error) {
//     console.error("Check social user error:", error);
//     res.status(500).json({
//       exists: false,
//       message: "Server error",
//     });
//   }
// }


// // social login...........

// export const socialLogin = async (req, res) => {
//   try {
//     const { email, social_id, provider } = req.body;

//     // ✅ Find user by social credentials
//     const userResult = await pool.query(
//       `SELECT u.id, u.name, u.email, u.grade_level, u.provider
//        FROM users u
//        WHERE u.email = $1 AND u.social_id = $2 AND u.provider = $3
//        LIMIT 1`,
//       [email, social_id, provider]
//     );

//     const user = userResult.rows[0];

//     if (!user) {
//       return res.status(404).json({
//         status: false,
//         message: "User not found",
//       });
//     }

//     // ✅ Fetch grade
//     const gradeResult = await pool.query(
//       `SELECT id, grade_level FROM grades WHERE id = $1 LIMIT 1`,
//       [user.grade_level]
//     );

//     const grade = gradeResult.rows[0] || null;

//     // ✅ Fetch subjects (many-to-many)
//     const subjectsResult = await pool.query(
//       `SELECT s.id, s.subject
//        FROM subjects s
//        INNER JOIN user_subjects us ON us.subject_id = s.id
//        WHERE us.user_id = $1`,
//       [user.id]
//     );

//     const subjects = subjectsResult.rows;

//     // ✅ Generate JWT token
//     const token = jwt.sign(
//       {
//         id: user.id,
//         email: user.email,
//         provider: user.provider,
//       },
//       process.env.JWT_SECRET,
//       { expiresIn: "24h" }
//     );

//     res.json({
//       status: true,
//       message: "Login successful",
//       token,
//       data: {
//         id: user.id,
//         name: user.name,
//         email: user.email,
//         grade_level: user.grade_level,
//         grade,
//         subjects,
//         provider: user.provider,
//         profile_completed: true,
//       },
//     });
//   } catch (error) {
//     console.error("Social login error:", error);
//     res.status(500).json({
//       status: false,
//       message: "Server error",
//     });
//   }
// };




// 1. Check if social user exists
export const checkSocialUser = async (req, res) => {
  try {
    const { email, social_id, provider } = req.body;

    if (!email || !social_id || !provider) {
      return res.status(400).json({
        status: false,
        message: "Email, social_id, and provider are required"
      });
    }

    // Check if user exists with exact social login credentials
    const socialUserRes = await pool.query(
      `SELECT * FROM users WHERE email = $1 AND social_id = $2 AND provider = $3`,
      [email, social_id, provider]
    );

    // Check if user exists with same email (any login method)
    const emailUserRes = await pool.query(
      `SELECT * FROM users WHERE email = $1`,
      [email]
    );

    // Check if this email has any other social providers linked
    const otherSocialRes = await pool.query(
      `SELECT * FROM users WHERE email = $1 AND provider IS NOT NULL AND provider != $2`,
      [email, provider]
    );

    return res.json({
      status: true,
      exists: socialUserRes.rows.length > 0, // Exact social match
      emailExists: emailUserRes.rows.length > 0, // Email exists (any method)
      hasOtherSocial: otherSocialRes.rows.length > 0, // Has other social accounts
      user: socialUserRes.rows.length > 0 ? socialUserRes.rows[0] :
        (emailUserRes.rows.length > 0 ? emailUserRes.rows[0] : null),
      existingUser: emailUserRes.rows.length > 0 ? emailUserRes.rows[0] : null,
      message: socialUserRes.rows.length > 0 ? "Social user exists" :
        emailUserRes.rows.length > 0 ? "Email exists with different login method" :
          "User not found"
    });
  } catch (error) {
    console.error('Check social user error:', error);
    res.status(500).json({
      status: false,
      exists: false,
      message: "Server error"
    });
  }
};

// link social login........

export const linkSocialAccount = async (req, res) => {
  try {
    const { email, social_id, provider, name, photoURL } = req.body;

    if (!email || !social_id || !provider) {
      return res.status(400).json({
        status: false,
        message: "Email, social_id, and provider are required"
      });
    }

    // Find existing user by email
    const existingUserRes = await pool.query(
      `SELECT * FROM users WHERE email = $1`,
      [email]
    );

    if (existingUserRes.rows.length === 0) {
      return res.status(404).json({
        status: false,
        message: "User not found"
      });
    }

    const existingUser = existingUserRes.rows[0];

    // Check if this social account is already linked to another user
    const socialConflictRes = await pool.query(
      `SELECT * FROM users WHERE social_id = $1 AND provider = $2 AND email != $3`,
      [social_id, provider, email]
    );

    if (socialConflictRes.rows.length > 0) {
      return res.status(400).json({
        status: false,
        message: `This ${provider} account is already linked to another user`
      });
    }

    // Update the existing user to link the social account
    const updatedUserRes = await pool.query(
      `UPDATE users 
       SET social_id = $1, 
           provider = $2, 
           is_social_login = true,
           profile_photo_url = COALESCE(profile_photo_url, $3),
           name = COALESCE(name, $4)
       WHERE email = $5 
       RETURNING id, email, name, grade_level, selected_subjects, grade_id, 
                daily_reminder_time, questions_per_day, school_name, phone, 
                provider, social_id, is_social_login, profile_photo_url`,
      [social_id, provider, photoURL, name, email]
    );

    const user = updatedUserRes.rows[0];

    // Generate JWT token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });

    return res.json({
      status: true,
      message: `${provider} account linked successfully`,
      user,
      token,
      redirect: "home",
      linked: true
    });

  } catch (error) {
    console.error('Link social account error:', error);
    res.status(500).json({
      status: false,
      message: "Server error"
    });
  }
};


// 2. Social login API
// export const socialLogin = async (req, res) => {
//   try {
//     const { email, social_id, provider } = req.body;

//     if (!email || !social_id || !provider) {
//       return res.status(400).json({
//         status: false,
//         message: "Email, social_id, and provider are required",
//       });
//     }

//     // Find user and join with grades to get grade_value
//     const userRes = await pool.query(
//       `SELECT u.id, u.email, u.name, u.grade_level, u.selected_subjects, 
//               u.grade_id, g.grade_level as grade_value,
//               u.daily_reminder_time, u.questions_per_day, u.school_name, 
//               u.phone, u.provider, u.social_id, u.is_social_login, 
//               u.profile_photo_url
//        FROM users u
//        LEFT JOIN grades g ON g.id = u.grade_id
//        WHERE (u.email = $1 AND u.social_id = $2 AND u.provider = $3) 
//           OR (u.email = $1 AND u.provider = $3)`,
//       [email, social_id, provider]
//     );

//     if (userRes.rows.length === 0) {
//       return res.status(404).json({
//         status: false,
//         message: "User not found",
//       });
//     }

//     const user = userRes.rows[0];

//     // Fetch subject details if selected
//     let selectedSubjectsNames = [];
//     if (user.selected_subjects && user.selected_subjects.length > 0) {
//       const { rows: subjectRows } = await pool.query(
//         `SELECT id, icon, subject 
//          FROM subjects 
//          WHERE id = ANY($1::int[])`,
//         [user.selected_subjects.map(Number)]
//       );
//       selectedSubjectsNames = subjectRows.map((r) => ({
//         id: r.id,
//         subject: r.subject,
//         icon: r.icon,
//       }));
//     }

//     // If social_id doesn’t match, update it
//     if (user.social_id !== social_id) {
//       await pool.query(
//         `UPDATE users SET social_id = $1 WHERE id = $2`,
//         [social_id, user.id]
//       );
//       user.social_id = social_id;
//     }

//     // Generate JWT token
//     const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
//       expiresIn: "7d",
//     });

//     // Remove raw selected_subjects from response
//     const { selected_subjects: _, ...userData } = user;

//     return res.json({
//       status: true,
//       message: "Social login successful",
//       data: {
//         ...userData,
//         grade_value: user.grade_value, // ✅ joined from grades
//         selected_subjects: selectedSubjectsNames,
//       },
//       token,
//       redirect: "home",
//     });
//   } catch (error) {
//     console.error("Social login error:", error);
//     res.status(500).json({
//       status: false,
//       message: "Server error",
//     });
//   }
// };

export const socialLogin = async (req, res) => {
  try {
    const { email, social_id, provider } = req.body;

    if (!email || !social_id || !provider) {
      return res.status(400).json({
        status: false,
        message: "Email, social_id, and provider are required",
      });
    }

    // Find user and join with grades to get grade_value
    const userRes = await pool.query(
      `SELECT u.id, u.email, u.name, u.grade_level, u.selected_subjects, 
              u.grade_id, g.grade_level as grade_value,
              u.daily_reminder_time, u.questions_per_day, u.school_name, 
              u.phone, u.provider, u.social_id, u.is_social_login, 
              u.profile_photo_url
       FROM users u
       LEFT JOIN grades g ON g.id = u.grade_id
       WHERE (u.email = $1 AND u.social_id = $2 AND u.provider = $3) 
          OR (u.email = $1 AND u.provider = $3)`,
      [email, social_id, provider]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    const user = userRes.rows[0];

    // Fetch subject details if selected
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

    // If social_id doesn't match, update it
    if (user.social_id !== social_id) {
      await pool.query(
        `UPDATE users SET social_id = $1 WHERE id = $2`,
        [social_id, user.id]
      );
      user.social_id = social_id;
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
      expiresIn: "7d",
    });

    // 🎯 Generate smart notifications after successful social login
    // Run in background to avoid delaying login response
    setTimeout(async () => {
      try {
        await NotificationService.generateLoginNotifications(user.id);
      } catch (error) {
        console.error("Error generating social login notifications:", error);
      }
    }, 1000); // 1 second delay

    // Remove raw selected_subjects from response
    const { selected_subjects: _, ...userData } = user;

    return res.json({
      status: true,
      message: "Social login successful",
      data: {
        ...userData,
        grade_value: user.grade_value, // ✅ joined from grades
        selected_subjects: selectedSubjectsNames,
      },
      token,
      redirect: "home",
    });
  } catch (error) {
    console.error("Social login error:", error);
    res.status(500).json({
      status: false,
      message: "Server error",
    });
  }
};

// 3. Social registration API (creates user without OTP)
export const socialRegister = async (req, res) => {
  try {
    const { email, name, provider, social_id, profile_picture_url } = req.body;

    if (!email || !name || !provider || !social_id) {
      return res.status(400).json({
        status: false,
        message: "Email, name, provider, and social_id are required"
      });
    }

    // Check if user already exists with this social login
    const existingSocialUser = await pool.query(
      `SELECT * FROM users WHERE email = $1 AND social_id = $2 AND provider = $3`,
      [email, social_id, provider]
    );

    if (existingSocialUser.rows.length > 0) {
      return res.status(400).json({
        status: false,
        message: "User already registered with this social account"
      });
    }

    // Check if user exists with same email but different login method
    const existingEmailUser = await pool.query(
      `SELECT * FROM users WHERE email = $1`,
      [email]
    );

    if (existingEmailUser.rows.length > 0) {
      return res.status(400).json({
        status: false,
        message: "Email already registered. Please use regular login or different social account."
      });
    }

    // Insert social user into DB (no password, no OTP needed)
    const userRes = await pool.query(
      `INSERT INTO users (email, name, provider, social_id, is_social_login, profile_photo_url) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id, email, name, provider, social_id, is_social_login`,
      [email, name, provider, social_id, true, profile_picture_url || null]
    );

    const user = userRes.rows[0];

    // Create user settings
    await pool.query(
      `INSERT INTO user_settings (user_id) VALUES ($1)`,
      [user.id]
    );

    return res.json({
      status: true,
      message: "Social registration successful. Please complete your profile.",
      user,
      requiresProfile: true
    });

  } catch (err) {
    console.error('Social register error:', err);
    res.status(500).json({ status: false, message: "Server error" });
  }
};

// 4. Updated updateGradesubject API to handle social users
// export const updateGradesubject = async (req, res) => {
//   try {
//     const {
//       email,
//       grade_level,
//       selected_subjects,
//       grade_id,
//       is_social_completion // Flag for social users completing profile
//     } = req.body;

//     if (!email) {
//       return res.status(400).json({ status: false, message: "Email is required" });
//     }

//     // ✅ Validate required fields
//     if (!grade_level || !selected_subjects || selected_subjects.length < 3 || !grade_id) {
//       return res.status(400).json({
//         status: false,
//         message: "Missing or invalid fields. Select minimum 3 subjects."
//       });
//     }

//     // ✅ Update user and return with grade_value
//     const userRes = await pool.query(
//       `UPDATE users 
//        SET grade_level = $1, 
//            selected_subjects = $2, 
//            grade_id = $3
//        WHERE email = $4
//        RETURNING id, email, name, grade_level, selected_subjects, grade_id, 
//                  daily_reminder_time, questions_per_day, school_name, phone,
//                  provider, social_id, is_social_login`,
//       [grade_level, selected_subjects, grade_id, email]
//     );

//     if (userRes.rows.length === 0) {
//       return res.status(404).json({ status: false, message: "User not found" });
//     }

//     let user = userRes.rows[0];

//     // ✅ Fetch grade_value
//     const gradeRes = await pool.query(
//       `SELECT grade_level FROM grades WHERE id = $1 LIMIT 1`,
//       [user.grade_id]
//     );

//     const grade_value = gradeRes.rows.length > 0 ? gradeRes.rows[0].grade_level : null;

//     // ✅ Generate JWT token
//     const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });

//     return res.json({
//       status: true,
//       message: `${is_social_completion ? "Social registration" : "User profile"} updated successfully`,
//       user: {
//         ...user,
//         grade_value, // ✅ add grade_value
//       },
//       token,
//       redirect: "home",
//     });
//   } catch (err) {
//     console.error("updateGradesubject error:", err);
//     res.status(500).json({ status: false, message: "Server error" });
//   }
// };

export const updateGradesubject = async (req, res) => {
  try {
    const {
      email,
      grade_level,
      selected_subjects,
      grade_id,
      is_social_completion // Optional flag for social completion
    } = req.body;

    if (!email) {
      return res.status(400).json({ status: false, message: "Email is required" });
    }

    // ✅ Validate required fields
    if (!grade_level || !selected_subjects || selected_subjects.length < 3 || !grade_id) {
      return res.status(400).json({
        status: false,
        message: "Missing or invalid fields. Select minimum 3 subjects."
      });
    }

    // ✅ Update user
    const userRes = await pool.query(
      `UPDATE users 
       SET grade_level = $1, 
           selected_subjects = $2, 
           grade_id = $3
       WHERE email = $4
       RETURNING *`,
      [grade_level, selected_subjects, grade_id, email]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ status: false, message: "User not found" });
    }

    let user = userRes.rows[0];

    // ✅ Fetch grade_value
    const gradeRes = await pool.query(
      `SELECT grade_level FROM grades WHERE id = $1 LIMIT 1`,
      [user.grade_id]
    );
    const grade_value = gradeRes.rows.length > 0 ? gradeRes.rows[0].grade_level : null;

    // ✅ Fetch subject details (convert IDs to full objects)
    let selectedSubjectsDetails = [];
    if (user.selected_subjects && user.selected_subjects.length > 0) {
      const { rows: subjectRows } = await pool.query(
        `SELECT id, icon, subject 
         FROM subjects 
         WHERE id = ANY($1::int[])`,
        [user.selected_subjects.map(Number)]
      );
      selectedSubjectsDetails = subjectRows.map((r) => ({
        id: r.id,
        subject: r.subject,
        icon: r.icon,
      }));
    }

    // ✅ Generate JWT token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });

    // ✅ Remove sensitive fields
    const { password, ...userData } = user;

    // ✅ Return unified response (same structure as login)
    return res.json({
      status: true,
      data: {
        ...userData,
        selected_subjects: selectedSubjectsDetails,
        grade_value,
      },
      token,
      redirect: "home",
    });
  } catch (err) {
    console.error("updateGradesubject error:", err);
    res.status(500).json({ status: false, message: "Server error" });
  }
};


// admin login.......

export const adminCommonlogin = async (req, res) => {
  const client = await pool.connect(); // ✅ Get client for transaction
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        status: false,
        message: "Email and password are required",
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        status: false,
        message: "Please enter a valid email address",
      });
    }

    // Check both admin & superadmin tables
    const adminQuery = `
      SELECT id, name, email, password, active_status, is_active_request, 'admin' AS role 
      FROM admins 
      WHERE email = $1
    `;

    const superAdminQuery = `
      SELECT id, name, email, password, 'superadmin' AS role 
      FROM superadmin 
      WHERE email = $1
    `;

    const [adminResult, superAdminResult] = await Promise.all([
      client.query(adminQuery, [email]),
      client.query(superAdminQuery, [email]),
    ]);

    const user = adminResult.rows[0] || superAdminResult.rows[0];

    if (!user) {
      return res.status(401).json({
        status: false,
        message: "Invalid email or password",
      });
    }

    // 🔥 CHECK ACTIVE ONLY FOR ADMIN
    if (user.role === "admin") {
      if (user.active_status === false) {
        return res.status(403).json({
          status: false,
          message: "Your account is inactive. Please contact support.",
          data: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            is_active_request: user.is_active_request
          }
        });
      }
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        status: false,
        message: "Invalid email or password",
      });
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    const { password: _, ...cleanUser } = user;

    return res.json({
      status: true,
      message: `${user.role} login successful`,
      data: cleanUser,
      token,
    });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  } finally {
    client.release(); // ✅ Always release client
  }
};



export const seedTopics = async (req, res) => {
  const client = await pool.connect();
  try {
    // fetch all subjects with grade info
    const { rows: subjects } = await client.query(`
      SELECT s.id AS subject_id, s.subject, g.id AS grade_id, g.grade_level
      FROM subjects s
      JOIN grades g ON g.id = s.grade_id
      ORDER BY g.id, s.id
    `);

    // predefined topics per subject (grade-aware)
    const topicsMap = {
      Mathematics: [
        "Numbers and Counting",
        "Basic Addition",
        "Subtraction Practice",
        "Shapes Recognition",
        "Simple Word Problems",
      ],
      "Mathematics Basics": [
        "Counting Objects",
        "Addition with Pictures",
        "Subtraction with Fingers",
        "Recognizing Shapes",
        "Comparing Numbers",
      ],
      "Simple Mathematics": [
        "Multiplication Tables",
        "Division Basics",
        "Fractions Introduction",
        "Word Problems",
        "Geometry Shapes",
      ],
      "Advanced Mathematics": [
        "Differentiation",
        "Integration Basics",
        "Probability",
        "Statistics Graphs",
        "Complex Numbers",
      ],
      English: [
        "Alphabet Practice",
        "Phonics Sounds",
        "Basic Vocabulary",
        "Simple Sentences",
        "Reading Short Stories",
      ],
      "English Phonics": [
        "Vowel Sounds",
        "Consonant Blends",
        "Rhyming Words",
        "Sight Words",
        "Short Sentences Reading",
      ],
      "Reading Skills": [
        "Comprehension",
        "Story Summarizing",
        "Character Analysis",
        "Reading Aloud",
        "Creative Writing",
      ],
      Science: [
        "Living and Nonliving",
        "Our Senses",
        "Plants Around Us",
        "Animals Around Us",
        "Weather Changes",
      ],
      "Fun Science": [
        "Magnet Experiments",
        "Floating and Sinking",
        "Mixing Colors",
        "Simple Machines",
        "Day and Night",
      ],
      "Nature Studies": [
        "Types of Plants",
        "Forest Animals",
        "Water Cycle",
        "Rocks and Soil",
        "Bird Migration",
      ],
      "General Science": [
        "Matter and States",
        "Forces and Motion",
        "Human Body Systems",
        "Electricity Basics",
        "Solar System",
      ],
      "Physics Fundamentals": [
        "Newton’s Laws",
        "Energy Types",
        "Gravity",
        "Work and Power",
        "Sound and Light",
      ],
      "Intro to Physics": [
        "Speed and Velocity",
        "Heat and Temperature",
        "Pressure",
        "Magnetism",
        "Light Reflection",
      ],
      "Chemistry Basics": [
        "Atoms and Molecules",
        "Periodic Table",
        "Chemical Reactions",
        "Acids and Bases",
        "Mixtures and Compounds",
      ],
      "Intro to Chemistry": [
        "States of Matter",
        "Simple Elements",
        "Periodic Trends",
        "Solutions",
        "Lab Safety",
      ],
      History: [
        "Early Civilizations",
        "Ancient Egypt",
        "Greek Myths",
        "Roman Empire",
        "Medieval Kings",
      ],
      "World History": [
        "Industrial Revolution",
        "World War I",
        "World War II",
        "Cold War",
        "Globalization",
      ],
      "Modern History": [
        "French Revolution",
        "American Independence",
        "World War Events",
        "Indian Freedom",
        "Modern Leaders",
      ],
      Geography: [
        "Continents and Oceans",
        "Maps and Directions",
        "Mountains",
        "Rivers",
        "Deserts",
      ],
      "Physical Geography": [
        "Plate Tectonics",
        "Volcanoes",
        "Earthquakes",
        "Climate Zones",
        "Natural Disasters",
      ],
      "Geography Maps": [
        "Map Reading",
        "Latitude and Longitude",
        "Climate Maps",
        "Population Maps",
        "Economic Maps",
      ],
      "Environmental Science": [
        "Pollution",
        "Renewable Energy",
        "Ecosystem",
        "Conservation",
        "Climate Change",
      ],
      // add more subjects if needed
    };

    const insertValues = [];
    const now = new Date();

    subjects.forEach((sub) => {
      const topics = topicsMap[sub.subject] || [
        "Introduction",
        "Core Concepts",
        "Applications",
        "Case Studies",
        "Practice Questions",
      ];

      topics.slice(0, 5).forEach((topic) => {
        insertValues.push(
          client.query(
            `INSERT INTO topics (subject_id, topic, created_at, updated_at, grade_level, grade_id)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [sub.subject_id, topic, now, now, sub.grade_level, sub.grade_id]
          )
        );
      });
    });

    await Promise.all(insertValues);

    return res.status(201).json({
      success: true,
      message: "Topics seeded successfully",
      count: insertValues.length,
    });
  } catch (err) {
    console.error("Seeding topics error:", err);
    return res.status(500).json({
      success: false,
      message: "Error seeding topics",
    });
  } finally {
    client.release();
  }
};

// seedTopics()


const generateOptions = () => {
  return [
    { id: 1, text: "Option A" },
    { id: 2, text: "Option B" },
    { id: 3, text: "Option C" },
    { id: 4, text: "Option D" },
  ];
};

export const seedQuestions = async (req, res) => {
  const client = await pool.connect();

  try {
    // ✅ Get all grades
    const { rows: grades } = await client.query("SELECT id, grade_level FROM grades");

    for (const grade of grades) {
      // ✅ Get subjects under each grade
      const { rows: subjects } = await client.query(
        "SELECT id, subject FROM subjects WHERE grade_id=$1",
        [grade.id]
      );

      for (const subject of subjects) {
        // ✅ Get topics under each subject
        const { rows: topics } = await client.query(
          "SELECT id, topic FROM topics WHERE subject_id=$1",
          [subject.id]
        );

        for (const topic of topics) {
          // ✅ Insert 100 questions per topic
          for (let i = 1; i <= 100; i++) {
            const options = generateOptions();
            const correctOption = options[Math.floor(Math.random() * 4)].id;

            await client.query(
              `INSERT INTO questions 
                (subject, question_text, options, correct_option_id, created_at, 
                 difficulty_level, grade_level, question_type, question_url, topic_id, 
                 answer_explanation, answer_file_url, topics)
               VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7,$8,$9,$10,$11,$12)`,
              [
                subject.subject,                                  // subject name
                `Sample Question ${i} for ${topic.topic}`,        // question_text
                JSON.stringify(options),                          // options
                correctOption,                                    // correct option
                "Easy",                                           // difficulty_level
                grade.grade_level,                                // grade level string
                "MCQ",                                            // question_type
                null,                                             // question_url
                topic.id,                                         // topic_id
                "This is a sample explanation.",                  // explanation
                null,                                             // answer file url
                topic.topic                                       // topic name
              ]
            );
          }
        }
      }
    }

    return res.status(201).json({
      success: true,
      message: "100 questions inserted for each topic under each subject & grade",
    });
    console.log("inserted")
  } catch (error) {
    console.error("Seed questions error:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  } finally {
    client.release();
  }
};

// seedQuestions()



export const userResetPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const { rows: existingAdmin } = await pool.query(
      `SELECT id, email FROM users WHERE email = $1`,
      [email]
    );

    if (existingAdmin.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const admin = existingAdmin[0];

    const otp = crypto.randomInt(10000, 99999).toString();
    const expiryTime = new Date(Date.now() + 2 * 60 * 1000);

    await pool.query(
      `UPDATE users SET otp = $1, otp_expire_time = $2 WHERE id = $3`,
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
      subject: "User Password Reset OTP",
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
    console.error("❌ User reset password error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};


// confirm password.........

export const userconfirmPassword = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and new password are required",
      });
    }

    const result = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const admin = result.rows[0];

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    await pool.query(
      "UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2",
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


// user player id save for onesignal.......

export const playerIdSave = async (req, res) => {
  const { playerId } = req.body;
  const userId = req.params.id || req.userId;

  try {
    // Check existing Player ID for this user
    const existing = await pool.query(
      "SELECT player_id FROM user_push_tokens WHERE user_id = $1",
      [userId]
    );

    if (existing.rowCount === 0) {
      // No record, insert new
      await pool.query(
        "INSERT INTO user_push_tokens (user_id, player_id, subscribed, created_at) VALUES ($1, $2, true, now())",
        [userId, playerId]
      );
    } else {
      const oldPlayerId = existing.rows[0].player_id;
      if (oldPlayerId !== playerId) {
        // Update old Player ID
        await pool.query(
          "UPDATE user_push_tokens SET player_id=$1, subscribed=true WHERE user_id=$2",
          [playerId, userId]
        );
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
};

// admin edit question.......

export const updatequestion = async (req, res) => {
  try {
    const {
      question_id,
      question_text,
      options,
      correct_option_id,
      subject_id,
      grade_id,
      topic_id,
      question_type,
      answer_explanation,
    } = req.body;

    if (!question_id) {
      return res.status(400).json({ status: false, message: "question_id is required" });
    }

    // ✅ Fetch grade, subject, topic names
    const gradeRes = await pool.query("SELECT grade_level FROM grades WHERE id = $1", [grade_id]);
    const subjectRes = await pool.query("SELECT subject FROM subjects WHERE id = $1", [subject_id]);
    const topicRes = await pool.query("SELECT topic FROM topics WHERE id = $1", [topic_id]);

    const grade_level = gradeRes.rows[0]?.grade_level || null;
    const subject = subjectRes.rows[0]?.subject || null;
    const topic = topicRes.rows[0]?.topic || null;

    // ✅ Handle file uploads (optional)
    let question_url = null;
    let answer_file_url = null;

    if (req.files?.question_url) {
      const file = req.files.question_url[0]; // assuming multer
      question_url = await uploadBufferToVercel(file.buffer, file.originalname);
    }

    if (req.files?.answer_file_url) {
      const file = req.files.answer_file_url[0];
      answer_file_url = await uploadBufferToVercel(file.buffer, file.originalname);
    }

    // ✅ Update question
    await pool.query(
      `UPDATE questions
       SET 
         question_text = $1,
         options = $2,
         correct_option_id = $3,
         subject_id = $4,
         topic_id = $5,
         question_type = $6,
         question_url = COALESCE($7, question_url),
         answer_explanation = $8,
         answer_file_url = COALESCE($9, answer_file_url),
         grade_level = $10,
         subject = $11,
         topics = $12
       WHERE id = $13`,
      [
        question_text,
        JSON.stringify(options), // store as JSON
        correct_option_id,
        subject_id,
        topic_id,
        question_type,
        question_url,
        answer_explanation,
        answer_file_url,
        grade_level,
        subject,
        topic,
        question_id,
      ]
    );

    res.json({ status: true, message: "Question updated successfully" });
  } catch (error) {
    console.error("Update Question Error:", error);
    res.status(500).json({ status: false, message: "Server error" });
  }
};

// admin create subject and topics

export const admincreateSubject = async (req, res) => {
  try {
    const { grade_id, subject, topics } = req.body;
    // topics is optional, expected as array of topic names: ["Topic 1", "Topic 2"]
    console.log("req body", req.body)
    if (!grade_id || !subject) {
      return res.status(400).json({ status: false, message: "grade_id and subject are required" });
    }

    // ✅ Upload icon if provided
    let iconUrl = null;
    if (req.files?.icon) {
      const file = req.files.icon[0]; // assuming multer
      iconUrl = await uploadBufferToVercel(file.buffer, file.originalname);
    }

    // ✅ Insert subject
    const subjectResult = await pool.query(
      `INSERT INTO subjects (grade_id, subject, icon)
       VALUES ($1, $2, $3)
       RETURNING id, grade_id, subject, icon`,
      [grade_id, subject, iconUrl]
    );

    const subjectId = subjectResult.rows[0].id;

    // ✅ Fetch grade_level for topics
    const gradeRes = await pool.query(`SELECT grade_level FROM grades WHERE id = $1`, [grade_id]);
    const grade_level = gradeRes.rows[0]?.grade_level || null;

    // ✅ Insert topics if provided
    let insertedTopics = [];
    if (topics && Array.isArray(topics) && topics.length > 0) {
      for (let t of topics) {
        const topicRes = await pool.query(
          `INSERT INTO topics (grade_id, grade_level, subject_id, topic)
           VALUES ($1, $2, $3, $4)
           RETURNING id, grade_id, grade_level, subject_id, topic`,
          [grade_id, grade_level, subjectId, t]
        );
        insertedTopics.push(topicRes.rows[0]);
      }
    }

    res.json({
      status: true,
      message: "Subject created successfully",
      data: {
        subject: subjectResult.rows[0],
        topics: insertedTopics
      }
    });

  } catch (error) {
    console.error("Create Subject Error:", error);
    res.status(500).json({ status: false, message: "Server error" });
  }
};


// admin create topics separeatly...

export const admincreateTopic = async (req, res) => {
  try {
    const { grade_id, subject_id, topic } = req.body;

    if (!grade_id || !subject_id || !topic) {
      return res.status(400).json({ status: false, message: "grade_id, subject_id and topic are required" });
    }

    const gradeRes = await pool.query(
      `SELECT grade_level FROM grades WHERE id = $1`,
      [grade_id]
    );
    if (gradeRes.rows.length === 0) {
      return res.status(404).json({ status: false, message: "Grade not found" });
    }

    const grade_level = gradeRes.rows[0].grade_level;

    const result = await pool.query(
      `INSERT INTO topics (grade_id, grade_level, subject_id, topic, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id, grade_id, grade_level, subject_id, topic`,
      [grade_id, grade_level, subject_id, topic]
    );

    res.json({
      status: true,
      message: "Topic created successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Create Topic Error:", error);
    res.status(500).json({ status: false, message: "Server error" });
  }
};

// admin request for active..........

export const adminRequestActive = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN'); // ✅ Start transaction

    const { admin_id } = req.body;

    if (!admin_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        status: false,
        message: "Admin ID is required",
      });
    }

    // 1️⃣ Check if admin exists
    const checkQuery = `SELECT id, is_active_request FROM admins WHERE id = $1 FOR UPDATE`;
    const checkResult = await client.query(checkQuery, [admin_id]);

    if (checkResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        status: false,
        message: "Admin not found",
      });
    }

    const admin = checkResult.rows[0];

    // 2️⃣ If already requested → throw error
    if (admin.is_active_request === true) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        status: false,
        message: "You have already requested activation",
      });
    }

    // 3️⃣ Update request flag
    const updateQuery = `
      UPDATE admins 
      SET is_active_request = true, updated_at = NOW()
      WHERE id = $1
      RETURNING id, is_active_request
    `;

    const updateResult = await client.query(updateQuery, [admin_id]);
    
    await client.query('COMMIT'); // ✅ Commit transaction

    return res.status(200).json({
      status: true,
      message: "Activation request sent successfully",
      data: updateResult.rows[0],
    });

  } catch (error) {
    await client.query('ROLLBACK'); // ✅ Rollback on error
    console.error("adminRequestActive error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  } finally {
    client.release(); // ✅ Always release client
  }
};

