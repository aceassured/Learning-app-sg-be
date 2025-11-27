import express from 'express';
import multer from 'multer';
import auth from '../middleware/auth.js';
import { uploadBufferToVercel } from '../utils/vercel-blob.js';
import {
  adminEdit, adminRegister, adminResetPassword, commonLogin, confirmPassword, deleteQuestions, editProfile, getAdmindetails, getAllquestions,
  getProfile, getUserdetails, homeApi, login, newQuestionsadd, register, userEdit, userRegister, verifyOtp, addNewUser, changeUserRole, deleteAdminUser, getAllUsers,
  getAllSubject,
  getAllGrade,
  userVoteforpoll,
  Commonlogin,
  userregisterApi,
  userJustregisterApi,
  userverifyOtp,
  updateGradesubject,
  socialLogin,
  checkSocialUser,
  socialRegister,
  linkSocialAccount,
  adminCommonlogin,
  getAllSubjectnew,
  userResetPassword,
  userconfirmPassword,
  playerIdSave,
  generateBiometricRegistration,
  verifyBiometricRegistration,
  generateBiometricAuth,
  bioMetricLogin,
  cleanupBiometricRecords,
  getParticularquestions,
  getAllquestionsSearch,
  removeBiometricCrendentials,
  superadminRegister,
  adminRequestActive,
  userRequestActive
} from '../controller/usercontroller.js';
import { deleteForum, deleteUser } from '../controller/forumcontroller.js';
import { admingetTopics, getTopics } from '../controller/quizcontroller.js';
import jwt from "jsonwebtoken"

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

import pool from '../../database.js';
import { commonLoginValidation } from '../middleware/adminMiddleware.js';
import { attachUserAndAbility } from '../middleware/abilityMiddleware.js';
import { authorize } from '../middleware/authorize.js';

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();


router.post('/login', login);
router.post('/register', register);

router.get('/me', auth, getProfile);

router.post('/me/edit', auth, upload.single('profile_photo'), async (req, res, next) => {
  try {
    if (req.file) {
      const url = await uploadBufferToVercel(req.file.buffer, req.file.originalname);
      req.fileUrl = url;
    }
    next();
  } catch (err) {
    next(err);
  }
}, editProfile);



// admins apis....

router.post("/userregisters", userRegister)
router.post("/adminregister", adminRegister)
router.post("/superadminregister", superadminRegister)
router.post("/usercommonlogin", commonLogin)
router.get("/adminusers", auth, getUserdetails)
router.get("/admindetail", auth, getAdmindetails)
router.post("/resetpassword", adminResetPassword)
router.post("/userresetpassword", userResetPassword)
router.post("/verifyotp", verifyOtp)
router.put("/confirmpassword", confirmPassword)
router.put("/userconfirmpassword", userconfirmPassword)
router.put("/addpassword", userconfirmPassword)
router.put("/adminedit", auth, upload.single("file"), adminEdit)
router.put("/edit", auth, upload.single("profile_photo"), userEdit);
router.post("/questionadd", upload.fields([{ name: "file", maxCount: 1 }, { name: "fileanswer", maxCount: 1 }]), newQuestionsadd);
router.get("/allquestions", getAllquestions)
router.get("/questions", getAllquestionsSearch)
router.get("/home", homeApi)
router.delete("/deletequestion", deleteQuestions)
router.delete("/deleteuser",   authorize('delete', 'User'), deleteUser)
router.post("/addNewUser", addNewUser)
router.put("/changeUserRole", changeUserRole)
router.delete("/deleteAdminUser", deleteAdminUser)
router.get("/getAllUsers", getAllUsers);
router.get("/getallsubject", getAllSubject);
router.post("/subject", getAllSubjectnew);
router.get("/getallgrades", getAllGrade);
router.post('/gettopics', getTopics);
router.post('/admingettopics', admingetTopics);
router.post('/uservotepoll', auth, userVoteforpoll);



// production....

router.post("/commonlogin", Commonlogin)
router.post("/admincommonlogin",commonLoginValidation, adminCommonlogin)
router.post("/userregister", userregisterApi)
router.post("/userjustregister", userJustregisterApi)
router.post("/userverifyotp", userverifyOtp)
router.post("/completeregister", updateGradesubject)

router.post('/checksocialuser', checkSocialUser);
router.post('/socialregister', socialRegister);
router.post('/linksocialaccount', linkSocialAccount);
router.post('/sociallogin', socialLogin)
router.put('/activerequest', adminRequestActive)
router.put('/useractiverequest', userRequestActive)

router.get("/data-deletion", async (req, res) => {
  return res.status(200).json({
    message: "User data deletion process",
    instructions: "Send an email to dm@aceassured.com to request deletion. We will delete your data within 7 days.",
    email: "dm@aceassured.com",
  });
});


router.post("/save-player-id", auth, playerIdSave)


// Biometric authentication routes
router.post('/generate-biometric-registration', generateBiometricRegistration);
router.post('/verify-biometric-registration', verifyBiometricRegistration);
router.post('/generate-biometric-auth', generateBiometricAuth); // No email required
router.post('/biometric-login', bioMetricLogin); // No email required

// optional
router.delete('/cleanup-biometric-records/:id', removeBiometricCrendentials);



// Instagram login API
// STEP 1️⃣ - Redirect user to Instagram login
router.get("/instagram/login", (req, res) => {
  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI;
  const clientId = process.env.INSTAGRAM_APP_ID;
  const scope = "user_profile,user_media";
  const authUrl = `${process.env.INSTAGRAM_AUTH_URL}?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=code`;

  res.redirect(authUrl);
});

// STEP 2️⃣ - Instagram redirects here after login
// Instagram callback API
router.get("/webhooks/instagram", async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ status: false, message: "Missing authorization code" });
  }

  try {
    // Exchange code for access_token
    const tokenRes = await axios.post(INSTAGRAM_TOKEN_URL, null, {
      params: {
        client_id: process.env.INSTAGRAM_APP_ID,
        client_secret: process.env.INSTAGRAM_APP_SECRET,
        grant_type: "authorization_code",
        redirect_uri: process.env.INSTAGRAM_REDIRECT_URI,
        code,
      },
    });

    const { access_token } = tokenRes.data;

    // Fetch user info
    const userInfoRes = await axios.get(`${INSTAGRAM_USER_INFO_URL}`, {
      params: {
        fields: "id,username,account_type,media_count",
        access_token,
      },
    });

    const { id, username, account_type, media_count } = userInfoRes.data;
    const provider = "instagram";
    const social_id = id;
    const name = username;
    const email = null; // Instagram API does not return email
    const profile_photo_url = null;

    // Check if user already exists
    const existingUser = await pool.query(
      `SELECT * FROM users WHERE social_id = $1 AND provider = $2`,
      [social_id, provider]
    );

    let user;
    if (existingUser.rows.length > 0) {
      user = existingUser.rows[0];
    } else {
      // Create a new social login user
      const insertRes = await pool.query(
        `INSERT INTO users (email, name, provider, social_id, is_social_login, profile_photo_url)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, email, name, provider, social_id, is_social_login, grade_id, grade_level, selected_subjects, daily_reminder_time, questions_per_day, school_name, phone, profile_photo_url`,
        [email, name, provider, social_id, true, profile_photo_url]
      );
      user = insertRes.rows[0];
    }

    // Optionally store extra Instagram info
    await pool.query(
      `INSERT INTO instagram_accounts (user_id, instagram_user_id, username, account_type, media_count)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (instagram_user_id) DO UPDATE 
       SET username = EXCLUDED.username, media_count = EXCLUDED.media_count, account_type = EXCLUDED.account_type`,
      [user.id, social_id, username, account_type, media_count]
    );

    // ✅ Fetch grade value (same as in socialLogin)
    const gradeRes = await pool.query(
      `SELECT grade_level FROM grades WHERE id = $1`,
      [user.grade_id || null]
    );
    const grade_value = gradeRes.rows[0]?.grade_level || null;

    // ✅ Fetch selected subjects if available
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

    // ✅ Generate JWT token like in socialLogin
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
      expiresIn: "7d",
    });

    // ✅ Final response - identical to socialLogin
    res.json({
      status: true,
      message: "Instagram login successful",
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        grade_level: user.grade_level,
        grade_id: user.grade_id,
        grade_value,
        selected_subjects: selectedSubjectsNames,
        daily_reminder_time: user.daily_reminder_time,
        questions_per_day: user.questions_per_day,
        school_name: user.school_name,
        phone: user.phone,
        provider: user.provider,
        social_id: user.social_id,
        is_social_login: user.is_social_login,
        profile_photo_url: user.profile_photo_url,
      },
      token,
      redirect: "home",
    });

    console.log("✅ Instagram user login successful:", user);

  } catch (err) {
    console.error("Instagram OAuth Error:", err.response?.data || err.message);
    res.status(500).json({ status: false, message: "Instagram login failed" });
  }
});

router.use(attachUserAndAbility)


export default router;