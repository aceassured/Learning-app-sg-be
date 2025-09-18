import express from 'express';
import auth from '../middleware/auth.js';
import { getProgressPageData, getProgressPageDatanew } from '../controller/progressController.js';

const router = express.Router();

router.get('/', auth, getProgressPageData);
router.get('/analytics', auth, getProgressPageDatanew);

export default router;
