import express from 'express';
import multer from 'multer';
import auth from '../middleware/auth.js';
import { addComment, addLike, createPost, deleteComment, getAlllikesandComments, getForumAndPollFeed, getonlyForumNotes, listPosts, removeLike, saveForum } from '../controller/forumcontroller.js';

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

router.get('/', auth, listPosts);
router.get('/forumpolls', auth, getForumAndPollFeed);
router.post('/forumnotes',  getonlyForumNotes);
router.post('/addlike', auth,addLike);
router.post('/forumsaveunsave', auth, saveForum);
router.post('/removelike', auth, removeLike);
router.post('/addcomment', auth, addComment);
router.delete('/removecomment', auth, deleteComment);
router.post('/likesandcomments', auth, getAlllikesandComments);
router.post('/create', auth, upload.array('files', 5), createPost);

export default router;
