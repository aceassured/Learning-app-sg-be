import express from "express"
import { adminAnnouncementpoll, admincreatePoll, getAllpoll } from "../controller/admincontroller.js"
import auth from "../middleware/auth.js"
import { admincreateSubject, admincreateTopic, getParticularquestions, updatequestion } from "../controller/usercontroller.js"
import multer from "multer";

const upload = multer();

const router = express.Router()



router.post( "/admincreatepoll", auth ,admincreatePoll )
router.get( "/admingetallpoll", getAllpoll )
router.post( "/adminannouncementpoll", adminAnnouncementpoll )
router.post("/particularquestions", getParticularquestions)
router.put("/editquestion", updatequestion)
router.post("/createsubject", upload.fields([{ name: "icon", maxCount: 1 }]), admincreateSubject)
router.post("/createtopic", admincreateTopic)

export default router