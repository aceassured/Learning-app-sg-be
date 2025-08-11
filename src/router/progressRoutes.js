import express from 'express';
import auth from '../middleware/auth.js';
import { getProgressPageData } from '../controller/progressController.js';

const router = express.Router();

router.get('/', auth, getProgressPageData);

export default router;
