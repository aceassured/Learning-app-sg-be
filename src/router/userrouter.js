// src/router/userrouter.js
import express from 'express';
import multer from 'multer';
import auth from '../middleware/auth.js';
import { uploadBufferToVercel } from '../utils/vercel-blob.js';
import { editProfile, getProfile, login, register } from '../controller/usercontroller.js';

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

export default router;
