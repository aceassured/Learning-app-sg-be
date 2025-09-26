import express from 'express';
import multer from 'multer';
import auth from '../middleware/auth.js';
import { addComment, addLike, addView, createPost, deleteComment, deleteForum, editComment, editPost, getAlllikesandComments, getForumAndPollFeed, getNotesfromTopics, getonlyForumNotes, listPosts, removeLike, savedForumAndPolls, saveForumOrPoll, trackNoteAccess } from '../controller/forumcontroller.js';

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

router.get('/', auth, listPosts);
router.post('/savedforumorpolls', auth, savedForumAndPolls);
router.get('/forumpolls', auth, getForumAndPollFeed);
router.post('/forumnotes',  getonlyForumNotes);
router.post('/getnotesfile',  getNotesfromTopics);
router.post('/accessnote', auth, trackNoteAccess);
router.post('/addlike', auth,addLike);
router.post('/addview', auth,addView);
router.post('/forumsaveunsave', auth, saveForumOrPoll);
router.post('/removelike', auth, removeLike);
router.post('/addcomment', auth, addComment);
router.put('/editcomment', auth, editComment);
router.delete('/removecomment', auth, deleteComment);
router.post('/likesandcomments', auth, getAlllikesandComments);
router.post('/create', auth, upload.array('files', 5), createPost);
router.post('/edit', auth, upload.array('files', 5), editPost);
router.delete("/deleteforum", deleteForum)

export default router;
