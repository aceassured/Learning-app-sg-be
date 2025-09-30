import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { put } from '@vercel/blob';
import { randomUUID } from "crypto";
import unzipper from "unzipper";
import XLSX from "xlsx";
import fs from "fs";
import path from "path";
import pool from '../../database.js';
dotenv.config({ quiet: true });



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

const uploadedImagesCache = new Map();

export const questionFileupload = async (req, res) => {
  try {
    const zipPath = req.file.path;
    const extractDir = path.join("uploads", "extracted", Date.now().toString());
    fs.mkdirSync(extractDir, { recursive: true });

    // Extract ZIP
    await fs.createReadStream(zipPath).pipe(unzipper.Extract({ path: extractDir })).promise();

    // Find Excel
    const files = fs.readdirSync(extractDir);
    const excelFile = files.find(f => f.endsWith(".xlsx") || f.endsWith(".csv"));
    if (!excelFile) return res.status(400).send("Excel file not found in zip.");

    const workbook = XLSX.readFile(path.join(extractDir, excelFile));
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    for (const row of rows) {
      // Handle images
      const processImage = async (filename) => {
        if (!filename) return null;

        // If it's already a URL, just return it
        if (filename.startsWith("http")) return filename;

        // If we've already uploaded this filename in this batch, reuse URL
        if (uploadedImagesCache.has(filename)) {
          return uploadedImagesCache.get(filename);
        }

        // Else, upload to Vercel
        const filePath = path.join(extractDir, "images", filename);
        if (!fs.existsSync(filePath)) return null;

        const buffer = fs.readFileSync(filePath);
        const url = await uploadBufferToVercel(buffer, filename);

        uploadedImagesCache.set(filename, url);
        return url;
      };

      const questionUrl = await processImage(row.question_url);
      const answerFileUrl = await processImage(row.answer_file_url);

      const options = [
        { id: 1, text: row.option1 },
        { id: 2, text: row.option2 },
        { id: 3, text: row.option3 },
        { id: 4, text: row.option4 },
      ];

      await pool.query(
        `
        INSERT INTO questions (
          subject, question_text, options, correct_option_id, difficulty_level, grade_level,
          question_type, topics, correct_option_value, question_url, answer_explanation,
          answer_file_url, topic_id, subject_id
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (question_text, subject_id, topic_id)
        DO UPDATE SET
          subject = EXCLUDED.subject,
          options = EXCLUDED.options,
          correct_option_id = EXCLUDED.correct_option_id,
          difficulty_level = EXCLUDED.difficulty_level,
          grade_level = EXCLUDED.grade_level,
          question_type = EXCLUDED.question_type,
          topics = EXCLUDED.topics,
          correct_option_value = EXCLUDED.correct_option_value,
          question_url = EXCLUDED.question_url,
          answer_explanation = EXCLUDED.answer_explanation,
          answer_file_url = EXCLUDED.answer_file_url;
        `,
        [
          row.subject,
          row.question_text,
          JSON.stringify(options),
          row.correct_option_id,
          row.difficulty_level,
          row.grade_level,
          row.question_type,
          row.topics,
          row.correct_option_value,
          questionUrl,
          row.answer_explanation,
          answerFileUrl,
          row.topic_id,
          row.subject_id,
        ]
      );
    }

    res.json({ message: "Bulk upload completed successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error processing bulk upload");
  }
}