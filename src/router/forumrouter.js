import express from 'express';
import multer from 'multer';
import auth from '../middleware/auth.js';
import { createPost, listPosts } from '../controller/forumcontroller.js';

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

router.get('/', listPosts);
router.post('/create', auth, upload.array('files', 5), createPost);

export default router;
