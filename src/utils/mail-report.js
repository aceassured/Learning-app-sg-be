// src/utils/mail-report.js
import PDFDocument from 'pdfkit';
import nodemailer from 'nodemailer';
import streamBuffers from 'stream-buffers';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: +process.env.SMTP_PORT,
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

export const sendQuizPdfToEmail = async ({to, userName, sessionDetails, answers}) => {
  // sessionDetails: {score, total, timeTaken, started_at, finished_at}
  const doc = new PDFDocument();
  const writableBuffer = new streamBuffers.WritableStreamBuffer();

  doc.pipe(writableBuffer);
  doc.fontSize(18).text(`Quiz Report for ${userName}`, {align:'center'});
  doc.moveDown();
  doc.text(`Score: ${sessionDetails.score}/${sessionDetails.total}`);
  doc.text(`Time Taken: ${sessionDetails.timeTaken || 'N/A'}`);
  doc.moveDown();
  doc.fontSize(14).text('Questions:');
  answers.forEach((a, idx) => {
    doc.moveDown(0.2);
    doc.fontSize(12).text(`${idx+1}. ${a.question_text}`);
    doc.text(`Your answer: ${a.selected_option_text} - ${a.is_correct ? 'Correct' : 'Wrong'}`);
    doc.text(`Correct answer: ${a.correct_option_text}`);
  });

  doc.end();

  const pdfBuffer = writableBuffer.getContents();

  await transporter.sendMail({
    from: process.env.FROM_EMAIL,
    to,
    subject: 'Your Quiz Report',
    text: 'Attached is your quiz report.',
    attachments: [{
      filename: 'quiz-report.pdf',
      content: pdfBuffer
    }]
  });
};
