import express from "express"
import { adminAnnouncementpoll, admincreatePoll, getAllpoll } from "../controller/admincontroller.js"
import auth from "../middleware/auth.js"
import { admincreateSubject, admincreateTopic, getAllTopic, getParticularquestions, updatequestion } from "../controller/usercontroller.js"
import multer from "multer";
import { questionFileupload } from "../utils/vercel-blob.js";


const upload = multer();
const uploadNew = multer({ dest: "uploads/" });
const router = express.Router()



router.post( "/admincreatepoll", auth ,admincreatePoll )
router.get( "/admingetallpoll", getAllpoll )
router.get( "/alltopics", getAllTopic )
router.post( "/adminannouncementpoll", adminAnnouncementpoll )
router.post("/particularquestions", getParticularquestions)
router.put("/editquestion",   upload.fields([
    { name: "question_url", maxCount: 1 },
    { name: "answer_file_url", maxCount: 1 }
  ]),updatequestion)
router.post("/createsubject", upload.fields([{ name: "icon", maxCount: 1 }]), admincreateSubject)
router.post("/createtopic", admincreateTopic)
router.post("/questionsupload", uploadNew.single("zipFile"), questionFileupload)

export default router