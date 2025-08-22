import express from 'express';
import multer from 'multer';
import auth from '../middleware/auth.js';
import { uploadBufferToVercel } from '../utils/vercel-blob.js';
import { adminEdit, adminRegister, adminResetPassword, commonLogin, confirmPassword, deleteQuestions, editProfile, getAdmindetails, getAllquestions, 
  getProfile, getUserdetails, homeApi, login, newQuestionsadd, register, userEdit, userRegister, verifyOtp,addNewUser,changeUserRole ,deleteAdminUser,getAllUsers} from '../controller/usercontroller.js';
import { deleteForum, deleteUser } from '../controller/forumcontroller.js';

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

router.post("/userregister", userRegister)
router.post("/adminregister", adminRegister)
router.post("/commonlogin", commonLogin)
router.get("/adminusers", auth, getUserdetails)
router.get("/admindetail", auth, getAdmindetails)
router.post("/resetpassword", adminResetPassword)
router.post("/verifyotp", verifyOtp)
router.put("/confirmpassword", confirmPassword)
router.put("/adminedit",auth, upload.single("file"), adminEdit)
router.put("/edit", auth, upload.single("profile_photo"), userEdit);
router.post("/questionadd", newQuestionsadd)
router.get("/allquestions", getAllquestions)
router.get("/home", homeApi)
router.delete("/deletequestion", deleteQuestions)
router.delete("/deleteforum", deleteForum)
router.delete("/deleteuser", deleteUser)
router.post("/addNewUser",addNewUser)
router.put("/changeUserRole",changeUserRole)
router.delete("/deleteAdminUser",deleteAdminUser)
router.get("/getAllUsers",getAllUsers);




export default router;
