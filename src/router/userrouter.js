// src/router/userrouter.js
import express from 'express';
import multer from 'multer';
import auth from '../middleware/auth.js';
import { uploadBufferToVercel } from '../utils/vercel-blob.js';
import { adminRegister, adminResetPassword, commonLogin, confirmPassword, deleteQuestions, editProfile, getAllquestions, getProfile, getUserdetails, login, newQuestionsadd, register, userEdit, userRegister, verifyOtp } from '../controller/usercontroller.js';
import { deleteForum } from '../controller/forumcontroller.js';

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

router.post('/login', login);
router.post('/register', register);

// get profile
router.get('/me', auth, getProfile);

// edit profile with optional photo
router.post('/me/edit', auth, upload.single('profile_photo'), async (req, res, next) => {
  try {
    if (req.file) {
      // upload to vercel
      const url = await uploadBufferToVercel(req.file.buffer, req.file.originalname);
      req.fileUrl = url;
    }
    next();
  } catch (err) {
    next(err);
  }
}, editProfile);



// admins apis....

router.post("/userregister", userRegister)
router.post("/adminregister", adminRegister)
router.post("/commonlogin", commonLogin)
router.get("/adminusers", auth, getUserdetails)
router.post("/resetpassword", adminResetPassword)
router.post("/verifyotp", verifyOtp)
router.put("/confirmpassword", confirmPassword)
router.put("/edit", auth, upload.single("profile_photo"), userEdit);
router.post("/questionadd", newQuestionsadd)
router.get("/allquestions", getAllquestions)
router.delete("/deletequestion", deleteQuestions)
router.delete("/deleteforum", deleteForum)




export default router;
