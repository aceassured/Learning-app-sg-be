import express from 'express';
import auth from '../middleware/auth.js';
import { getHomeData, reviewSession, startQuiz, submitAnswers, getTopics, startMiniQuiz, startRevisionQuiz } from '../controller/quizcontroller.js';
import { sendNotificationToUser } from '../services/onesignal.js';

const router = express.Router();

router.use(auth);

router.get('/home', getHomeData);
router.post('/start', startQuiz);
router.post('/startminiquiz', auth, startMiniQuiz);
router.post('/startrevision', auth, startRevisionQuiz);
router.post('/submit', submitAnswers);
router.post('/test-notification/:userId', async (req, res) => {
  const { userId } = req.params;
  const result = await sendNotificationToUser(userId, "Test notification");
  res.json(result)})

router.get('/review/:sessionId', reviewSession);

export default router;
