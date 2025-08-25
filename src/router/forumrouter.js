import express from 'express';
import multer from 'multer';
import auth from '../middleware/auth.js';
import { addComment, addLike, createPost, deleteComment, getAlllikesandComments, listPosts, removeLike } from '../controller/forumcontroller.js';

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

router.get('/', auth, listPosts);
router.post('/addlike', auth,addLike);
router.delete('/removelike', auth, removeLike);
router.post('/addcomment', auth, addComment);
router.delete('/removecomment', auth, deleteComment);
router.post('/likesandcomments', auth, getAlllikesandComments);
router.post('/create', auth, upload.array('files', 5), createPost);

export default router;
