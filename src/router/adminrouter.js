import express from "express"
import { adminAnnouncementpoll, admincreatePoll, getAllpoll } from "../controller/admincontroller.js"
import auth from "../middleware/auth.js"
import { getParticularquestions, updatequestion } from "../controller/usercontroller.js"

const router = express.Router()



router.post( "/admincreatepoll", auth ,admincreatePoll )
router.get( "/admingetallpoll", getAllpoll )
router.post( "/adminannouncementpoll", adminAnnouncementpoll )
router.post("/particularquestions", getParticularquestions)
router.post("/editquestion", updatequestion)

export default router