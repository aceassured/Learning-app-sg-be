import express from "express"
import { adminAnnouncementpoll, adminCreateBulkEditableQuizQuestions, adminCreateEditQuiz, admincreatePoll, adminDashboardApi, adminEditPoll, adminUpdateUserStatus, analyzePDF, createGrades, deleteEditableUpload, deleteEditQuiz, deleteGrade, deletePoll, deleteSubject, deleteTopic, getAllEditQuizzes, getAllEditQuizzesnew, getAllpoll, getAllQuestionsnew, getEditableUploadData, getEditableUploadHistory, getParticularEditableQuiz, getUserEditingQuiz, prebuildDocument, updateEditQuiz, updateGrade, updateSubject, updateTopics } from "../controller/admincontroller.js"
import auth from "../middleware/auth.js"
import { admincreateSubject, admincreateTopic, getAllTopic, getParticularquestions, updatequestion } from "../controller/usercontroller.js"
import multer from "multer";
import { deleteUpload, getQuestionsForUpload, getUploadHistory, questionFileupload } from "../utils/vercel-blob.js";
import { extractPdfText } from "../utils/pdfExtractor.js";
import { parseQuestionsFromText } from "../utils/questionParser.js";


const upload = multer();
const uploadNew = multer({ dest: "uploads/" });
const router = express.Router()



router.post("/admincreatepoll", auth, upload.single("poll_image"), admincreatePoll)
router.post("/adminactiveordeactive", adminUpdateUserStatus)
router.put("/admineditpoll", upload.single("poll_image"), adminEditPoll)
router.get("/admingetallpoll", getAllpoll)
router.get("/alltopics", getAllTopic)
router.get("/allquestionsnew", getAllQuestionsnew)
router.post("/adminannouncementpoll", adminAnnouncementpoll)
router.post("/particularquestions", getParticularquestions)
router.put("/editquestion", upload.fields([
  { name: "question_url", maxCount: 1 },
  { name: "answer_file_url", maxCount: 1 }
]), updatequestion)
router.post("/createsubject", upload.fields([{ name: "icon", maxCount: 1 }]), admincreateSubject)
router.post("/createtopic", admincreateTopic)
router.post("/questionsupload", uploadNew.single("zipFile"), questionFileupload)
router.get('/upload-questions/:uploadBatchId', getQuestionsForUpload);

router.get('/upload-history', getUploadHistory);
router.delete('/delete-upload/:uploadId', deleteUpload);

// Grade Routes
router.post("/creategrade", createGrades);
router.put("/updategrades", updateGrade);
router.delete("/deletegrades", deleteGrade);
router.delete("/deletepoll", deletePoll);

// Subject Routes
router.put("/updatesubject", upload.single("icon"), updateSubject);
router.delete("/deletesubject", deleteSubject);

// Topic Routes
router.put("/updatetopic", updateTopics);
router.delete("/deletetopic", deleteTopic);

// Bulk upload editable quiz questions
router.post("/quiz/bulk-upload", upload.single("file"), adminCreateBulkEditableQuizQuestions)
router.get('/quiz-questions/:uploadBatchId', getEditableUploadData);
router.get('/quiz-upload-history', getEditableUploadHistory);
router.delete('/quiz-delete-upload/:uploadId', deleteEditableUpload);

router.post("/createeditquestion", adminCreateEditQuiz);
router.get("/geteditquestion", getUserEditingQuiz);
router.get("/getalleditquestions", getAllEditQuizzes);
router.get("/getalleditquestionsnew", getAllEditQuizzesnew);
router.put("/updateeditquestion/:id", updateEditQuiz);
router.delete("/deleteeditquestion/:id", deleteEditQuiz);
router.get("/geteditquestion/:id", getParticularEditableQuiz);
router.get("/admindashboard", adminDashboardApi);


router.post("/upload-pdf", upload.single("pdf"), async (req, res) => {

  try {

    if (!req.file) {
      return res.status(400).json({ message: "PDF required" });
    }
    console.log(req.file);

    // Step 1 Extract Text
    const text = await extractPdfText(req.file.buffer);


    // Step 2 Parse Questions
    const parsedData = parseQuestionsFromText(text);

    // Delete file after processing
    // fs.unlinkSync(req.file.path);

    res.json({
      message: "PDF processed successfully",
      data: parsedData,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Processing failed" });
  }
});

router.post("/analyze-pdf", upload.single("file"), analyzePDF);
router.post("/analyze", prebuildDocument);
export default router