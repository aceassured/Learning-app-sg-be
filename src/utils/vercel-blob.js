import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { put } from '@vercel/blob';
import { randomUUID } from "crypto";
import unzipper from "unzipper";
import XLSX from "xlsx";
import fs from "fs";
import path from "path";
dotenv.config({ quiet: true });
import pool from '../../database.js';
import { v4 as uuidv4 } from 'uuid'; // npm install uuid

import crypto from 'crypto';

export const uploadBufferToVercel = async (buffer, filename) => {
  try {
    // Add unique ID before filename
    const uniqueName = `${Date.now()}-${randomUUID()}-${filename}`;

    const blob = await put(`forumfile/${uniqueName}`, buffer, {
      access: "public",
      token: process.env.VERCEL_BLOB_TOKEN,
    });

    return blob.url;
  } catch (err) {
    console.error("Vercel blob upload failed:", err);
    throw new Error("Blob upload failed");
  }
};

// forum create, update, pdf, docx, zip...........

export const uploadBufferforumToVercel = async (buffer, filename) => {
  try {
    // Add unique ID before filename
    const uniqueName = `${Date.now()}-${randomUUID()}-${filename}`;

    const blob = await put(`forumfile/${uniqueName}`, buffer, {
      access: "public",
      token: process.env.VERCEL_BLOB_TOKEN,
    });

    return blob.url;
  } catch (err) {
    console.error("Vercel blob upload failed:", err);
    throw new Error("Blob upload failed");
  }
};


// export const questionFileupload = async (req, res) => {
//   try {
//     const zipPath = req.file.path;
//     const extractDir = path.join("uploads", "extracted", Date.now().toString());
//     fs.mkdirSync(extractDir, { recursive: true });

//     // Extract ZIP
//     await fs.createReadStream(zipPath).pipe(unzipper.Extract({ path: extractDir })).promise();

//     // Find Excel
//     const files = fs.readdirSync(extractDir);
//     const excelFile = files.find(f => f.endsWith(".xlsx") || f.endsWith(".csv"));
//     if (!excelFile) return res.status(400).send("Excel file not found in zip.");

//     const workbook = XLSX.readFile(path.join(extractDir, excelFile));
//     const sheetName = workbook.SheetNames[0];
//     const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

//     for (const row of rows) {
//       // Handle images
//       const processImage = async (filename) => {
//         if (!filename) return null;

//         // If it's already a URL, just return it
//         if (filename.startsWith("http")) return filename;

//         // If we've already uploaded this filename in this batch, reuse URL
//         if (uploadedImagesCache.has(filename)) {
//           return uploadedImagesCache.get(filename);
//         }

//         // Else, upload to Vercel
//         const filePath = path.join(extractDir, "images", filename);
//         if (!fs.existsSync(filePath)) return null;

//         const buffer = fs.readFileSync(filePath);
//         const url = await uploadBufferToVercel(buffer, filename);

//         uploadedImagesCache.set(filename, url);
//         return url;
//       };

//       const questionUrl = await processImage(row.question_url);
//       const answerFileUrl = await processImage(row.answer_file_url);

//       const options = [
//         { id: 1, text: row.option1 },
//         { id: 2, text: row.option2 },
//         { id: 3, text: row.option3 },
//         { id: 4, text: row.option4 },
//       ];

//       await pool.query(
//         `
//         INSERT INTO questions (
//           subject, question_text, options, correct_option_id, difficulty_level, grade_level,
//           question_type, topics, correct_option_value, question_url, answer_explanation,
//           answer_file_url, topic_id, subject_id
//         )
//         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
//         ON CONFLICT (question_text, subject_id, topic_id)
//         DO UPDATE SET
//           subject = EXCLUDED.subject,
//           options = EXCLUDED.options,
//           correct_option_id = EXCLUDED.correct_option_id,
//           difficulty_level = EXCLUDED.difficulty_level,
//           grade_level = EXCLUDED.grade_level,
//           question_type = EXCLUDED.question_type,
//           topics = EXCLUDED.topics,
//           correct_option_value = EXCLUDED.correct_option_value,
//           question_url = EXCLUDED.question_url,
//           answer_explanation = EXCLUDED.answer_explanation,
//           answer_file_url = EXCLUDED.answer_file_url;
//         `,
//         [
//           row.subject,
//           row.question_text,
//           JSON.stringify(options),
//           row.correct_option_id,
//           row.difficulty_level,
//           row.grade_level,
//           row.question_type,
//           row.topics,
//           row.correct_option_value,
//           questionUrl,
//           row.answer_explanation,
//           answerFileUrl,
//           row.topic_id,
//           row.subject_id,
//         ]
//       );
//     }

//     res.json({ message: "Bulk upload completed successfully" });
//   } catch (err) {
//     console.error(err);
//     res.status(500).send("Error processing bulk upload");
//   }
// }



// export const questionFileupload = async (req, res) => {
//   try {
//     const zipPath = req.file.path;
//     const extractDir = path.join("uploads", "extracted", Date.now().toString());
//     fs.mkdirSync(extractDir, { recursive: true });

//     // Extract ZIP
//     await fs.createReadStream(zipPath).pipe(unzipper.Extract({ path: extractDir })).promise();

//     // Find Excel
//     const files = fs.readdirSync(extractDir);
//     const excelFile = files.find(f => f.endsWith(".xlsx") || f.endsWith(".csv"));
//     if (!excelFile) return res.status(400).send("Excel file not found in zip.");

//     const workbook = XLSX.readFile(path.join(extractDir, excelFile));
//     const sheetName = workbook.SheetNames[0];
//     const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

//     // Cache for uploaded images (avoid re-uploading same file)
//     const uploadedImagesCache = new Map();

//     // Common function to process images
//     const processImage = async (filename) => {
//       if (!filename) return null;

//       // If it's already a URL, just return it
//       if (typeof filename === "string" && filename.startsWith("http")) return filename;

//       // If we've already uploaded this filename in this batch, reuse URL
//       if (uploadedImagesCache.has(filename)) {
//         return uploadedImagesCache.get(filename);
//       }

//       // Else, upload to Vercel
//       const filePath = path.join(extractDir, "images", filename);
//       if (!fs.existsSync(filePath)) return null;

//       const buffer = fs.readFileSync(filePath);
//       const url = await uploadBufferToVercel(buffer, filename);

//       uploadedImagesCache.set(filename, url);
//       return url;
//     };

//     // Iterate rows from Excel
//     for (const row of rows) {
//       const questionUrl = await processImage(row.question_url);
//       const answerFileUrl = await processImage(row.answer_file_url);

//       // handle options (text OR images OR numbers)
//       const imageExtensions = [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".svg"];
//       const options = [];
//       for (let i = 1; i <= 4; i++) {
//         let value = row[`option${i}`];
//         let finalValue = value;

//         if (value !== undefined && value !== null) {
//           if (typeof value === "number") {
//             // Convert numbers to string
//             finalValue = value.toString();
//           } else if (typeof value === "string") {
//             const lowerVal = value.toLowerCase();

//             // If already a URL, keep as is
//             if (lowerVal.startsWith("http")) {
//               finalValue = value;
//             }
//             // If looks like an image file, process it
//             else if (imageExtensions.some(ext => lowerVal.endsWith(ext))) {
//               finalValue = await processImage(value);
//             }
//             // else leave as plain text
//           }
//         } else {
//           finalValue = null; // handle empty cell
//         }

//         options.push({ id: i, text: finalValue });
//       }

//       await pool.query(
//         `
//         INSERT INTO questions (
//           subject, question_text, options, correct_option_id, grade_level,
//           question_type, topics, correct_option_value, question_url, answer_explanation,
//           answer_file_url, topic_id, subject_id
//         )
//         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
//         ON CONFLICT (question_text, subject_id, topic_id)
//         DO UPDATE SET
//           subject = EXCLUDED.subject,
//           options = EXCLUDED.options,
//           correct_option_id = EXCLUDED.correct_option_id,
//           grade_level = EXCLUDED.grade_level,
//           question_type = EXCLUDED.question_type,
//           topics = EXCLUDED.topics,
//           correct_option_value = EXCLUDED.correct_option_value,
//           question_url = EXCLUDED.question_url,
//           answer_explanation = EXCLUDED.answer_explanation,
//           answer_file_url = EXCLUDED.answer_file_url;
//         `,
//         [
//           row.subject,
//           row.question_text,
//           JSON.stringify(options),
//           row.correct_option_id,
//           row.grade_level,
//           row.question_type,
//           row.topics,
//           row.correct_option_value,
//           questionUrl,
//           row.answer_explanation,
//           answerFileUrl,
//           row.topic_id,
//           row.subject_id,
//         ]
//       );
//     }

//     res.json({ message: "Bulk upload completed successfully" });
//   } catch (err) {
//     console.error(err);
//     res.status(500).send("Error processing bulk upload");
//   }
// };


// Helper function to generate hash of file content
const generateFileHash = (buffer) => {
  return crypto.createHash('sha256').update(buffer).digest('hex');
};


// Helper function to generate hash of questions data
const generateQuestionsHash = (rows) => {
  // Create a consistent string representation of all questions
  const questionsString = rows.map(row => 
    JSON.stringify({
      question_text: row.question_text,
      subject: row.subject,
      options: [row.option1, row.option2, row.option3, row.option4],
      correct_option_id: row.correct_option_id,
      topics: row.topics
    })
  ).sort().join('|');
  
  return crypto.createHash('sha256').update(questionsString).digest('hex');
};

// Modified questionFileupload function with validation
export const questionFileupload = async (req, res) => {
  const uploadBatchId = uuidv4();
  let questionsInserted = 0;

  // Helper to send a consistent error and clean extracted folder
  const cleanupAndError = (extractDir, statusCode, payload) => {
    try {
      if (extractDir && fs.existsSync(extractDir)) {
        fs.rmSync(extractDir, { recursive: true, force: true });
      }
    } catch (e) {
      console.error("Cleanup error:", e);
    }
    return res.status(statusCode).json(payload);
  };

  try {
    // file required
    if (!req.file) {
      return res.status(400).json({ success: false, message: "ZIP file is required." });
    }

    const zipPath = req.file.path;
    const extractDir = path.join("uploads", "extracted", Date.now().toString());
    fs.mkdirSync(extractDir, { recursive: true });

    // Generate hash of the ZIP file
    const zipBuffer = fs.readFileSync(zipPath);
    const fileHash = generateFileHash(zipBuffer);

    // Extract ZIP (await completion)
    await fs.createReadStream(zipPath).pipe(unzipper.Extract({ path: extractDir })).promise();

    // Find Excel (xlsx or csv)
    const files = fs.readdirSync(extractDir);
    const excelFile = files.find(f => f.endsWith(".xlsx") || f.endsWith(".csv") || f.endsWith(".xls"));
    if (!excelFile) {
      return cleanupAndError(extractDir, 400, {
        success: false,
        message: "Excel file not found in zip."
      });
    }

    const workbook = XLSX.readFile(path.join(extractDir, excelFile));
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });

    // Basic header/column validation (require subject, topic, grade, question_text)
    const requiredColumns = ["subject", "topic", "grade", "question_text"];
    // check first row's keys (if file is empty, rows.length === 0)
    if (!rows || rows.length === 0) {
      return cleanupAndError(extractDir, 400, { success: false, message: "Excel sheet is empty." });
    }

    const headerKeys = Object.keys(rows[0]).map(k => k.trim());
    for (const col of requiredColumns) {
      if (!headerKeys.includes(col)) {
        return cleanupAndError(extractDir, 400, {
          success: false,
          message: `Missing required column "${col}" in Excel. Please include columns: ${requiredColumns.join(", ")}.`
        });
      }
    }

    // Generate hash of questions content
    const questionsHash = generateQuestionsHash(rows);

    // Duplicate check (same file hash & same questions hash)
    const duplicateCheck = await pool.query(
      `SELECT uh.*, 
        (SELECT COUNT(*) FROM questions WHERE upload_batch_id = uh.upload_batch_id) as actual_questions_count
       FROM upload_history uh
       WHERE uh.file_hash = $1 AND uh.questions_hash = $2
       LIMIT 1`,
      [fileHash, questionsHash]
    );

    if (duplicateCheck.rows.length > 0) {
      const duplicate = duplicateCheck.rows[0];
      return cleanupAndError(extractDir, 400, {
        success: false,
        message: `This exact file with the same questions was already uploaded on ${new Date(duplicate.uploaded_at).toLocaleString()}. It contains ${duplicate.actual_questions_count} questions. Please upload a different file or modify the questions.`,
        duplicate: {
          filename: duplicate.filename,
          uploaded_at: duplicate.uploaded_at,
          questions_count: duplicate.actual_questions_count
        }
      });
    }

    // Check if same filename exists with different content (warning)
    const sameFilenameCheck = await pool.query(
      `SELECT id, filename, uploaded_at FROM upload_history 
       WHERE filename = $1 AND (file_hash != $2 OR questions_hash != $3)
       ORDER BY uploaded_at DESC LIMIT 1`,
      [req.file.originalname, fileHash, questionsHash]
    );

    let warningMessage = "";
    if (sameFilenameCheck.rows.length > 0) {
      const existing = sameFilenameCheck.rows[0];
      warningMessage = ` Note: A file with the same name was uploaded on ${new Date(existing.uploaded_at).toLocaleString()} but with different content.`;
    }

    // Cache for uploaded images
    const uploadedImagesCache = new Map();

    const processImage = async (filename) => {
      if (!filename) return null;
      if (typeof filename === "string" && filename.trim() === "") return null;
      if (typeof filename === "string" && filename.startsWith("http")) return filename;
      if (uploadedImagesCache.has(filename)) {
        return uploadedImagesCache.get(filename);
      }

      const filePath = path.join(extractDir, "images", filename);
      if (!fs.existsSync(filePath)) return null;

      const buffer = fs.readFileSync(filePath);
      const url = await uploadBufferToVercel(buffer, filename);

      uploadedImagesCache.set(filename, url);
      return url;
    };

    // Start DB transaction
    await pool.query("BEGIN");

    // iterate with index for error messages (1-based row number)
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const rowNumber = rowIndex + 2; // +2 because header is row 1 in Excel
      const row = rows[rowIndex];

      // Trim strings and normalize keys
      const subjectName = (row.subject || "").toString().trim();
      const topicName = (row.topic || "").toString().trim();
      const gradeName = (row.grade || "").toString().trim();
      const questionText = row.question_text;
      // validate existence
      if (!subjectName) {
        await pool.query("ROLLBACK");
        return cleanupAndError(extractDir, 400, {
          success: false,
          message: `Row ${rowNumber}: 'subject' is required. Please provide subject name.`
        });
      }
      if (!topicName) {
        await pool.query("ROLLBACK");
        return cleanupAndError(extractDir, 400, {
          success: false,
          message: `Row ${rowNumber}: 'topic' is required. Please provide topic name.`
        });
      }
      if (!gradeName) {
        await pool.query("ROLLBACK");
        return cleanupAndError(extractDir, 400, {
          success: false,
          message: `Row ${rowNumber}: 'grade' is required. Please provide grade (e.g. Primary 3).`
        });
      }
      if (!questionText || questionText === "") {
        await pool.query("ROLLBACK");
        return cleanupAndError(extractDir, 400, {
          success: false,
          message: `Row ${rowNumber}: 'question_text' is required.`
        });
      }

      // 1) Lookup subject id
      const subjectRes = await pool.query(
        `SELECT id FROM subjects WHERE LOWER(subject) = LOWER($1) LIMIT 1`,
        [subjectName]
      );
      if (subjectRes.rowCount === 0) {
        await pool.query("ROLLBACK");
        return cleanupAndError(extractDir, 400, {
          success: false,
          message: `Row ${rowNumber}: Subject "${subjectName}" not found. Please add it to subjects table or correct the subject name.`
        });
      }
      const subjectId = subjectRes.rows[0].id;

      // 2) Lookup grade id
      const gradeRes = await pool.query(
        `SELECT id FROM grades WHERE LOWER(grade_level) = LOWER($1) LIMIT 1`,
        [gradeName]
      );
      if (gradeRes.rowCount === 0) {
        await pool.query("ROLLBACK");
        return cleanupAndError(extractDir, 400, {
          success: false,
          message: `Row ${rowNumber}: Grade "${gradeName}" not found. Please add it to grades table or correct the grade name.`
        });
      }
      const gradeId = gradeRes.rows[0].id;

      // 3) Lookup topic id (topic + subject + grade combined)
      const topicRes = await pool.query(
        `SELECT id FROM topics WHERE LOWER(topic) = LOWER($1) AND subject_id = $2 AND grade_id = $3 LIMIT 1`,
        [topicName, subjectId, gradeId]
      );
      if (topicRes.rowCount === 0) {
        await pool.query("ROLLBACK");
        return cleanupAndError(extractDir, 400, {
          success: false,
          message: `Row ${rowNumber}: Topic "${topicName}" for subject "${subjectName}" and grade "${gradeName}" not found. Please add it to topics table or correct the topic/subject/grade.`
        });
      }
      const topicId = topicRes.rows[0].id;

      // Process images
      const questionUrl = await processImage(row.question_url);
      const answerFileUrl = await processImage(row.answer_file_url);

      // Build options array (same logic as your original code)
      const imageExtensions = [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".svg"];
      const options = [];
      for (let i = 1; i <= 4; i++) {
        let value = row[`option${i}`];
        let finalValue = value;

        if (value !== undefined && value !== null && String(value).trim() !== "") {
          if (typeof value === "number") {
            finalValue = value.toString();
          } else if (typeof value === "string") {
            const lowerVal = value.toLowerCase();
            if (lowerVal.startsWith("http")) {
              finalValue = value;
            } else if (imageExtensions.some(ext => lowerVal.endsWith(ext))) {
              finalValue = await processImage(value);
            } else {
              finalValue = value;
            }
          }
        } else {
          finalValue = null;
        }

        options.push({ id: i, text: finalValue });
      }

      // Insert or update question (using looked-up ids)
      const result = await pool.query(
        `
        INSERT INTO questions (
          subject, question_text, options, correct_option_id,
          question_type, topics, correct_option_value, question_url, answer_explanation,
          answer_file_url, topic_id, subject_id, grade_id, upload_batch_id
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (question_text, subject_id, topic_id)
        DO UPDATE SET
          subject = EXCLUDED.subject,
          options = EXCLUDED.options,
          correct_option_id = EXCLUDED.correct_option_id,
          grade_id = EXCLUDED.grade_id,
          question_type = EXCLUDED.question_type,
          topics = EXCLUDED.topics,
          correct_option_value = EXCLUDED.correct_option_value,
          question_url = EXCLUDED.question_url,
          answer_explanation = EXCLUDED.answer_explanation,
          answer_file_url = EXCLUDED.answer_file_url,
          upload_batch_id = EXCLUDED.upload_batch_id
        RETURNING id;
        `,
        [
          row.subject,
          row.question_text,
          JSON.stringify(options),
          row.correct_option_id,
          row.question_type,
          row.topics,
          row.correct_option_value,
          questionUrl,
          row.answer_explanation,
          answerFileUrl,
          topicId,
          subjectId,
          gradeId,
          uploadBatchId
        ]
      );

      if (result.rowCount > 0) {
        questionsInserted++;
      }
    } // end for rows

    // Save upload history with hashes
    await pool.query(
      `INSERT INTO upload_history (filename, questions_count, upload_batch_id, status, file_hash, questions_hash, type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [req.file.originalname, questionsInserted, uploadBatchId, 'success', fileHash, questionsHash, 'normal']
    );

    // Commit transaction
    await pool.query("COMMIT");

    // Clean up extracted files
    fs.rmSync(extractDir, { recursive: true, force: true });

    return res.json({
      success: true,
      message: `Bulk upload completed successfully! ${questionsInserted} questions uploaded.${warningMessage}`,
      uploadBatchId,
      questionsInserted
    });
  } catch (err) {
    console.error("Bulk upload error:", err);

    try {
      await pool.query("ROLLBACK");
    } catch (rErr) {
      console.error("Rollback error:", rErr);
    }

    // Save failed upload history (best-effort)
    try {
      await pool.query(
        `INSERT INTO upload_history (filename, questions_count, upload_batch_id, status, type)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.file?.originalname || 'unknown', 0, uploadBatchId, 'failed', 'normal']
      );
    } catch (uhErr) {
      console.error("Failed to insert upload_history for failed upload:", uhErr);
    }

    // Clean up extracted files if exist
    try {
      const extractDir = path.join("uploads", "extracted", Date.now().toString());
      if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      // ignore
    }

    return res.status(500).json({
      success: false,
      message: "Error processing bulk upload",
      error: err.message
    });
  }
};


// Get upload history
export const getUploadHistory = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, filename, uploaded_at, questions_count, status, upload_batch_id
       FROM upload_history
       WHERE status = 'success' AND type = 'normal' ORDER BY uploaded_at DESC
       LIMIT 50`
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Error fetching upload history"
    });
  }
};

// Delete upload and associated questions
export const deleteUpload = async (req, res) => {
  const { uploadId } = req.params;
  
  try {
    // Get upload batch ID
    const uploadResult = await pool.query(
      `SELECT upload_batch_id, filename FROM upload_history WHERE id = $1`,
      [uploadId]
    );

    if (uploadResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Upload not found"
              });
    }

    const { upload_batch_id, filename } = uploadResult.rows[0];

    // Delete all questions from this upload batch
    const deleteResult = await pool.query(
      `DELETE FROM questions WHERE upload_batch_id = $1`,
      [upload_batch_id]
    );

    // Delete upload history record
    await pool.query(
      `DELETE FROM upload_history WHERE id = $1`,
      [uploadId]
    );

    res.json({
      success: true,
      message: `Successfully deleted upload "${filename}" and ${deleteResult.rowCount} associated questions.`,
      deletedQuestions: deleteResult.rowCount
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Error deleting upload",
      error: err.message
    });
  }
};

// Get questions for a specific upload batch
export const getQuestionsForUpload = async (req, res) => {
  const { uploadBatchId } = req.params;
  
  try {
    const result = await pool.query(
      `SELECT 
        id,
        subject,
        question_text,
        question_url,
        options,
        correct_option_id,
        grade_id,
        topics,
        question_type,
        answer_explanation,
        answer_file_url,
        created_at
      FROM questions 
      WHERE upload_batch_id = $1
      ORDER BY created_at DESC`,
      [uploadBatchId]
    );

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Error fetching questions for this upload"
    });
  }
};