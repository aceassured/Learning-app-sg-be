import { body, validationResult } from "express-validator";
import pool from "../../database.js";

export const createGrammarClozeValidator = [
  // Title
  body("title")
  .optional({ nullable: true, checkFalsy: true })
  .trim()
  .isLength({ min: 5 })
  .withMessage("Title must be at least 5 characters"),

  // Passage
  body("passage")
    .trim()
    .notEmpty()
    .withMessage("Passage is required")
    .isLength({ min: 20 })
    .withMessage("Passage must be at least 20 characters"),

  // Grade ID (Required)
  body("grade_id")
    .notEmpty()
    .withMessage("grade_id is required")
    .isInt()
    .withMessage("grade_id must be integer"),

  // Subject ID (Required)
  body("subject_id")
    .notEmpty()
    .withMessage("subject_id is required")
    .isInt()
    .withMessage("subject_id must be integer"),

  // Topic ID (OPTIONAL)
  body("topic_id")
  .optional({ nullable: true, checkFalsy: true })
  .isInt()
  .withMessage("topic_id must be integer"),

  // Difficulty level (OPTIONAL)
  body("difficulty_level")
  .optional({ nullable: true, checkFalsy: true })
  .isIn(["easy", "medium", "hard"])
  .withMessage("difficulty_level must be easy, medium or hard"),

  // Options
  body("options")
    .isArray({ min: 2 })
    .withMessage("At least 2 options required"),

  // Correct Answers
  body("correctAnswers")
  .notEmpty()
  .withMessage("correctAnswers is required")
    .isObject()
    .withMessage("correctAnswers must be an object"),

  // Custom Advanced Validation
  body().custom(async (value) => {
    const {
      passage,
      options,
      correctAnswers,
      grade_id,
      subject_id,
      topic_id,
    } = value;

    // Validate blanks
    const blankMatches = passage.match(/\((\d+)\)/g);
    if (!blankMatches) {
      throw new Error("No blanks found in passage");
    }

    const blankNumbers = blankMatches.map((b) =>
      parseInt(b.replace(/[()]/g, ""))
    );

    const uniqueBlanks = new Set(blankNumbers);
    if (uniqueBlanks.size !== blankNumbers.length) {
      throw new Error("Duplicate blank numbers found");
    }

    for (let i = 0; i < blankNumbers.length; i++) {
      if (!blankNumbers.includes(i + 1)) {
        throw new Error("Blank numbers must start from 1 and be sequential");
      }
    }

    if (Object.keys(correctAnswers).length !== blankNumbers.length) {
      throw new Error("Correct answers count must match blank count");
    }

    // Validate options
    const labelSet = new Set();

    for (const option of options) {
      if (!option.label || !option.text) {
        throw new Error("Option label and text are required");
      }

      if (!/^[A-Z]$/.test(option.label)) {
        throw new Error("Option labels must be single uppercase letters");
      }

      if (labelSet.has(option.label)) {
        throw new Error("Duplicate option labels not allowed");
      }

      labelSet.add(option.label);
    }

    // Validate correct answers
    for (const label of Object.values(correctAnswers)) {
      if (!labelSet.has(label)) {
        throw new Error(
          `Correct answer ${label} does not match any option`
        );
      }
    }

    // Validate grade exists
    const gradeCheck = await pool.query(
      "SELECT id FROM grades WHERE id = $1",
      [grade_id]
    );
    if (gradeCheck.rowCount === 0) {
      throw new Error("Invalid grade_id");
    }

    // Validate subject exists
    const subjectCheck = await pool.query(
      "SELECT id FROM subjects WHERE id = $1",
      [subject_id]
    );
    if (subjectCheck.rowCount === 0) {
      throw new Error("Invalid subject_id");
    }

    // Validate topic only if provided
    if (topic_id) {
      const topicCheck = await pool.query(
        "SELECT id FROM topics WHERE id = $1",
        [topic_id]
      );
      if (topicCheck.rowCount === 0) {
        throw new Error("Invalid topic_id");
      }
    }

    return true;
  }),
];

export const validateRequest = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map((err) => err.msg),
    });
  }

  next();
};











export const createComprehensionClozeValidator = [

    // Title
    body("title")
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ min: 5 })
    .withMessage("Title must be at least 5 characters"),
  
    // Passage
    body("passage")
      .trim()
      .notEmpty()
      .withMessage("Passage is required")
      .isLength({ min: 20 })
      .withMessage("Passage must be at least 20 characters"),
  
    // Grade
    body("grade_id")
      .notEmpty()
      .withMessage("grade_id is required")
      .isInt()
      .withMessage("grade_id must be integer"),
  
    // Subject
    body("subject_id")
      .notEmpty()
      .withMessage("subject_id is required")
      .isInt()
      .withMessage("subject_id must be integer"),
  
    // Topic (Optional)
    body("topic_id")
      .optional({ nullable: true, checkFalsy: true })
      .isInt()
      .withMessage("topic_id must be integer"),
  
    // Difficulty level (Optional)
    body("difficulty_level")
      .optional({ nullable: true, checkFalsy: true })
      .isIn(["easy", "medium", "hard"])
      .withMessage("difficulty_level must be easy, medium or hard"),
  
    // Correct Answers
    body("correctAnswers")
    .notEmpty()
    .withMessage("correctAnswers is required")
      .isObject()
      .withMessage("correctAnswers must be an object"),
  
    // ===============================
    // Advanced Custom Validation
    // ===============================
    body().custom(async (value) => {
  
      const {
        passage,
        correctAnswers,
        grade_id,
        subject_id,
        topic_id
      } = value;
  
      // -------------------------------
      // Validate blanks in passage
      // -------------------------------
      const blankMatches = passage.match(/\((\d+)\)/g);
  
      if (!blankMatches) {
        throw new Error("No blanks found in passage");
      }
  
      const blankNumbers = blankMatches.map(b =>
        parseInt(b.replace(/[()]/g, ""))
      );
  
      const uniqueBlanks = new Set(blankNumbers);
  
      if (uniqueBlanks.size !== blankNumbers.length) {
        throw new Error("Duplicate blank numbers found");
      }
  
      // Ensure blanks are sequential
      for (let i = 0; i < blankNumbers.length; i++) {
        if (!blankNumbers.includes(i + 1)) {
          throw new Error(
            "Blank numbers must start from 1 and be sequential"
          );
        }
      }
  
      // -------------------------------
      // Validate answers count
      // -------------------------------
      if (Object.keys(correctAnswers).length !== blankNumbers.length) {
        throw new Error(
          "Correct answers count must match blank count"
        );
      }
  
      // -------------------------------
      // Validate answer values
      // -------------------------------
      for (const key of Object.keys(correctAnswers)) {
  
        const answer = correctAnswers[key];
  
        if (!answer || answer.trim() === "") {
          throw new Error(`Answer missing for blank (${key})`);
        }
      }
  
      // -------------------------------
      // Validate grade
      // -------------------------------
      const gradeCheck = await pool.query(
        "SELECT id FROM grades WHERE id = $1",
        [grade_id]
      );
  
      if (gradeCheck.rowCount === 0) {
        throw new Error("Invalid grade_id");
      }
  
      // -------------------------------
      // Validate subject
      // -------------------------------
      const subjectCheck = await pool.query(
        "SELECT id FROM subjects WHERE id = $1",
        [subject_id]
      );
  
      if (subjectCheck.rowCount === 0) {
        throw new Error("Invalid subject_id");
      }
  
      // -------------------------------
      // Validate topic if provided
      // -------------------------------
      if (topic_id) {
  
        const topicCheck = await pool.query(
          "SELECT id FROM topics WHERE id = $1",
          [topic_id]
        );
  
        if (topicCheck.rowCount === 0) {
          throw new Error("Invalid topic_id");
        }
      }
  
      return true;
    }),
  
  ];
  
  export const validateRequestComprehenstion = (req, res, next) => {
  
    const errors = validationResult(req);
  
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array().map(err => err.msg)
      });
    }
  
    next();
  };