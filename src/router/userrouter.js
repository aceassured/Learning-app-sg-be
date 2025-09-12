import express from 'express';
import multer from 'multer';
import auth from '../middleware/auth.js';
import { uploadBufferToVercel } from '../utils/vercel-blob.js';
import { adminEdit, adminRegister, adminResetPassword, commonLogin, confirmPassword, deleteQuestions, editProfile, getAdmindetails, getAllquestions, 
  getProfile, getUserdetails, homeApi, login, newQuestionsadd, register, userEdit, userRegister, verifyOtp,addNewUser,changeUserRole ,deleteAdminUser,getAllUsers,
  getAllSubject,
  getAllGrade,
  userVoteforpoll,
  Commonlogin,
  userregisterApi,
  userJustregisterApi,
  userverifyOtp,
  updateGradesubject} from '../controller/usercontroller.js';
import { deleteForum, deleteUser } from '../controller/forumcontroller.js';
import { admingetTopics, getTopics } from '../controller/quizcontroller.js';

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

router.post('/login', login);
router.post('/register', register);

router.get('/me', auth, getProfile);

router.post('/me/edit', auth, upload.single('profile_photo'), async (req, res, next) => {
  try {
    if (req.file) {
      const url = await uploadBufferToVercel(req.file.buffer, req.file.originalname);
      req.fileUrl = url;
    }
    next();
  } catch (err) {
    next(err);
  }
}, editProfile);



// admins apis....

router.post("/userregisters", userRegister)
router.post("/adminregister", adminRegister)
router.post("/usercommonlogin", commonLogin)
router.get("/adminusers", auth, getUserdetails)
router.get("/admindetail", auth, getAdmindetails)
router.post("/resetpassword", adminResetPassword)
router.post("/verifyotp", verifyOtp)
router.put("/confirmpassword", confirmPassword)
router.put("/adminedit",auth, upload.single("file"), adminEdit)
router.put("/edit", auth, upload.single("profile_photo"), userEdit);
router.post("/questionadd",upload.fields([{ name: "file", maxCount: 1 },{ name: "fileanswer", maxCount: 1 }]),newQuestionsadd);
router.get("/allquestions", getAllquestions)
router.get("/home", homeApi)
router.delete("/deletequestion", deleteQuestions)
router.delete("/deleteforum", deleteForum)
router.delete("/deleteuser", deleteUser)
router.post("/addNewUser",addNewUser)
router.put("/changeUserRole",changeUserRole)
router.delete("/deleteAdminUser",deleteAdminUser)
router.get("/getAllUsers",getAllUsers);
router.get("/getallsubject",getAllSubject);
router.get("/getallgrades",getAllGrade);
router.post('/gettopics',auth,  getTopics);
router.post('/admingettopics', admingetTopics);
router.post('/uservotepoll', auth, userVoteforpoll);


// production....

router.post("/commonlogin", Commonlogin)
router.post("/userregister", userregisterApi)
router.post("/userjustregister", userJustregisterApi)
router.post("/userverifyotp", userverifyOtp)
router.post("/completeregister", updateGradesubject)

router.get("/data-deletion", async(req, res) => {
  return res.status(200).json({
    message: "User data deletion process",
    instructions: "Send an email to dm@aceassured.com to request deletion. We will delete your data within 7 days.",
    email: "dm@aceassured.com",
  });
});

export default router;
