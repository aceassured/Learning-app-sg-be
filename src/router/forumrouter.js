import express from 'express';
import multer from 'multer';
import auth from '../middleware/auth.js';
import { addComment, addLike, addView, createPost, deleteComment, deleteForum, deleteForumNotefiles, editComment, editPost, endThePoll, getAlllikesandComments, getForumAndPollFeed, getNotesfromTopics, getonlyForumNotes, listPosts, removeLike, savedForumAndPolls, saveForumOrPoll, trackNoteAccess } from '../controller/forumcontroller.js';

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "application/pdf",

    // ZIP
    "application/zip",
    "application/x-zip-compressed",

    // DOC
    "application/msword",

    // DOCX
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

    // XLSX
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

    // CSV
    "text/csv",
    "application/csv",
    "text/plain"
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only PDF, ZIP, DOC, DOCX, XLSX, and CSV files are allowed!"));
  }
};


const upload = multer({ storage, fileFilter });

const router = express.Router();

router.get('/', auth, listPosts);
router.post('/savedforumorpolls', auth, savedForumAndPolls);
router.post('/forumpolls', auth, getForumAndPollFeed);
router.post('/endthepoll', endThePoll);
router.post('/forumnotes', getonlyForumNotes);
router.post('/getnotesfile', getNotesfromTopics);
router.post('/accessnote', auth, trackNoteAccess);
router.post('/addlike', auth, addLike);
router.post('/addview', auth, addView);
router.post('/forumsaveunsave', auth, saveForumOrPoll);
router.post('/removelike', auth, removeLike);
router.post('/addcomment', auth, addComment);
router.put('/editcomment', auth, editComment);
router.delete('/removecomment', auth, deleteComment);
router.post('/likesandcomments', auth, getAlllikesandComments);
router.post('/create', auth, upload.array('files', 5), createPost);
router.post('/edit', auth, upload.array('files', 5), editPost);
router.delete("/deleteforum", deleteForum)
router.post("/deletenotefile", deleteForumNotefiles)

export default router;
