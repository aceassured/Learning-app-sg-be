// src/router/quizrouter.js
import express from 'express';
import auth from '../middleware/auth.js';
import { getHomeData, reviewSession, startQuiz, submitAnswers } from '../controller/quizcontroller.js';

const router = express.Router();

router.use(auth);

router.get('/home', getHomeData);
router.post('/start', startQuiz);
router.post('/submit', submitAnswers);
router.get('/review/:sessionId', reviewSession);

export default router;
