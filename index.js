import express from "express"
import dotenv from "dotenv"
import cors from "cors"
import helmet from "helmet"
import pool from "./database.js"
import userRouter from "./src/router/userrouter.js"
import quizRouter from "./src/router/quizrouter.js"
import forumRouter from "./src/router/forumrouter.js"
import progressStates from "./src/router/progressRoutes.js"
import adminRouter from "./src/router/adminrouter.js"
import fs from "fs";
import { exec } from "child_process";
dotenv.config({ quiet: true })

const app = express()

const PORT = process.env.PORT || 5959

app.use(express.urlencoded({ extended: true }));
app.use(express.json())
app.use(helmet())


const corsOptions = {
    origin: [
        'https://learing-app-sg-fe.vercel.app',
        'https://learning-app-admin-fe.vercel.app',
        'http://localhost:5173',
        'http://localhost:3000',
        'https://localhost:3000',
        'http://localhost:8000',
        'https://localhost:8000',
        'http://localhost:8001',
        'https://ace-hive-production-fe.vercel.app',
    ],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: ['Content-Type', 'Authorization', 'auth'],
    credentials: true,
    optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

app.use('/api/user', userRouter);
app.use('/api/quiz', quizRouter);
app.use('/api/forum', forumRouter);
app.use('/api/progress', progressStates);
app.use('/api/admin', adminRouter);


app.get("/", async (req, res) => {
    try {
        res.status(200).json("Learning App Backend Connected.......!")

    } catch (error) {
        console.log("error", error)
    }
})

// Direct database insertion script for your backend
// Run this in your backend where you have access to the pool

// All topics data from your database
export const allTopics = [
  // Grade 10 (grade_id: 1)
  {id: 1, subject_id: 1, topic: "Algebra Basics", grade_id: 1},
  {id: 2, subject_id: 1, topic: "Geometry", grade_id: 1},
  {id: 3, subject_id: 1, topic: "Trigonometry", grade_id: 1},
  {id: 4, subject_id: 1, topic: "Probability", grade_id: 1},
  {id: 5, subject_id: 1, topic: "Statistics", grade_id: 1},
  {id: 6, subject_id: 1, topic: "Linear Equations", grade_id: 1},
  {id: 7, subject_id: 1, topic: "Calculus (Intro)", grade_id: 1},
  {id: 8, subject_id: 1, topic: "Quadratic Functions", grade_id: 1},
  {id: 9, subject_id: 1, topic: "Coordinate Geometry", grade_id: 1},
  {id: 10, subject_id: 1, topic: "Mensuration", grade_id: 1},
  
  {id: 11, subject_id: 2, topic: "Physics Fundamentals", grade_id: 1},
  {id: 12, subject_id: 2, topic: "Chemistry Basics", grade_id: 1},
  {id: 13, subject_id: 2, topic: "Biology Cells", grade_id: 1},
  {id: 14, subject_id: 2, topic: "Human Anatomy", grade_id: 1},
  {id: 15, subject_id: 2, topic: "Genetics", grade_id: 1},
  {id: 16, subject_id: 2, topic: "Periodic Table", grade_id: 1},
  {id: 17, subject_id: 2, topic: "Forces & Motion", grade_id: 1},
  {id: 18, subject_id: 2, topic: "Electricity & Magnetism", grade_id: 1},
  {id: 19, subject_id: 2, topic: "Ecology", grade_id: 1},
  {id: 20, subject_id: 2, topic: "Environmental Science", grade_id: 1},
  
  {id: 21, subject_id: 3, topic: "Grammar Essentials", grade_id: 1},
  {id: 22, subject_id: 3, topic: "Vocabulary Building", grade_id: 1},
  {id: 23, subject_id: 3, topic: "Writing Skills", grade_id: 1},
  {id: 24, subject_id: 3, topic: "Reading Comprehension", grade_id: 1},
  {id: 25, subject_id: 3, topic: "Poetry Analysis", grade_id: 1},
  {id: 26, subject_id: 3, topic: "Drama Study", grade_id: 1},
  {id: 27, subject_id: 3, topic: "Essay Writing", grade_id: 1},
  {id: 28, subject_id: 3, topic: "Literature Classics", grade_id: 1},
  {id: 29, subject_id: 3, topic: "Storytelling", grade_id: 1},
  {id: 30, subject_id: 3, topic: "Public Speaking", grade_id: 1},
  
  {id: 31, subject_id: 4, topic: "Ancient Civilizations", grade_id: 1},
  {id: 32, subject_id: 4, topic: "Medieval Period", grade_id: 1},
  {id: 33, subject_id: 4, topic: "Renaissance", grade_id: 1},
  {id: 34, subject_id: 4, topic: "Revolutions", grade_id: 1},
  {id: 35, subject_id: 4, topic: "World Wars", grade_id: 1},
  {id: 36, subject_id: 4, topic: "Cold War", grade_id: 1},
  {id: 37, subject_id: 4, topic: "Independence Movements", grade_id: 1},
  {id: 38, subject_id: 4, topic: "Indian History", grade_id: 1},
  {id: 39, subject_id: 4, topic: "European History", grade_id: 1},
  {id: 40, subject_id: 4, topic: "Modern World", grade_id: 1},
  
  {id: 41, subject_id: 5, topic: "Continents & Oceans", grade_id: 1},
  {id: 42, subject_id: 5, topic: "Climate & Weather", grade_id: 1},
  {id: 43, subject_id: 5, topic: "Landforms", grade_id: 1},
  {id: 44, subject_id: 5, topic: "Population Studies", grade_id: 1},
  {id: 45, subject_id: 5, topic: "Natural Resources", grade_id: 1},
  {id: 46, subject_id: 5, topic: "Agriculture", grade_id: 1},
  {id: 47, subject_id: 5, topic: "Urbanization", grade_id: 1},
  {id: 48, subject_id: 5, topic: "Map Skills", grade_id: 1},
  {id: 49, subject_id: 5, topic: "Environmental Geography", grade_id: 1},
  {id: 50, subject_id: 5, topic: "Globalization", grade_id: 1},
  
  {id: 51, subject_id: 6, topic: "Drawing Basics", grade_id: 1},
  {id: 52, subject_id: 6, topic: "Painting", grade_id: 1},
  {id: 53, subject_id: 6, topic: "Sculpture", grade_id: 1},
  {id: 54, subject_id: 6, topic: "Art History", grade_id: 1},
  {id: 55, subject_id: 6, topic: "Modern Art", grade_id: 1},
  {id: 56, subject_id: 6, topic: "Digital Art", grade_id: 1},
  {id: 57, subject_id: 6, topic: "Design Principles", grade_id: 1},
  {id: 58, subject_id: 6, topic: "Color Theory", grade_id: 1},
  {id: 59, subject_id: 6, topic: "Famous Artists", grade_id: 1},
  {id: 60, subject_id: 6, topic: "Creative Expression", grade_id: 1},
  
  {id: 61, subject_id: 7, topic: "Musical Notes", grade_id: 1},
  {id: 62, subject_id: 7, topic: "Rhythm & Beats", grade_id: 1},
  {id: 63, subject_id: 7, topic: "Scales & Chords", grade_id: 1},
  {id: 64, subject_id: 7, topic: "Instruments", grade_id: 1},
  {id: 65, subject_id: 7, topic: "Classical Music", grade_id: 1},
  {id: 66, subject_id: 7, topic: "Folk Music", grade_id: 1},
  {id: 67, subject_id: 7, topic: "Modern Music", grade_id: 1},
  {id: 68, subject_id: 7, topic: "Singing Techniques", grade_id: 1},
  {id: 69, subject_id: 7, topic: "Composers", grade_id: 1},
  {id: 70, subject_id: 7, topic: "Music History", grade_id: 1},
  
  {id: 71, subject_id: 8, topic: "Fitness Basics", grade_id: 1},
  {id: 72, subject_id: 8, topic: "Yoga", grade_id: 1},
  {id: 73, subject_id: 8, topic: "Gymnastics", grade_id: 1},
  {id: 74, subject_id: 8, topic: "Athletics", grade_id: 1},
  {id: 75, subject_id: 8, topic: "Team Sports", grade_id: 1},
  {id: 76, subject_id: 8, topic: "Individual Sports", grade_id: 1},
  {id: 77, subject_id: 8, topic: "Health & Nutrition", grade_id: 1},
  {id: 78, subject_id: 8, topic: "Exercise Science", grade_id: 1},
  {id: 79, subject_id: 8, topic: "Sports Rules", grade_id: 1},
  {id: 80, subject_id: 8, topic: "Outdoor Activities", grade_id: 1},

  // Grade 11 (grade_id: 2)
  {id: 81, subject_id: 1, topic: "Advanced Algebra", grade_id: 2},
  {id: 82, subject_id: 1, topic: "Functions & Graphs", grade_id: 2},
  {id: 83, subject_id: 1, topic: "Trigonometric Identities", grade_id: 2},
  {id: 84, subject_id: 1, topic: "Sequences & Series", grade_id: 2},
  {id: 85, subject_id: 1, topic: "Probability & Permutations", grade_id: 2},
  {id: 86, subject_id: 1, topic: "Differentiation Basics", grade_id: 2},
  {id: 87, subject_id: 1, topic: "Integration Basics", grade_id: 2},
  {id: 88, subject_id: 1, topic: "Matrices & Determinants", grade_id: 2},
  {id: 89, subject_id: 1, topic: "Complex Numbers", grade_id: 2},
  {id: 90, subject_id: 1, topic: "Statistics Advanced", grade_id: 2},
  
  {id: 91, subject_id: 2, topic: "Mechanics", grade_id: 2},
  {id: 92, subject_id: 2, topic: "Thermodynamics", grade_id: 2},
  {id: 93, subject_id: 2, topic: "Waves & Oscillations", grade_id: 2},
  {id: 94, subject_id: 2, topic: "Organic Chemistry", grade_id: 2},
  {id: 95, subject_id: 2, topic: "Inorganic Chemistry", grade_id: 2},
  {id: 96, subject_id: 2, topic: "Molecular Biology", grade_id: 2},
  {id: 97, subject_id: 2, topic: "Genetics Advanced", grade_id: 2},
  {id: 98, subject_id: 2, topic: "Evolution", grade_id: 2},
  {id: 99, subject_id: 2, topic: "Ecology & Environment", grade_id: 2},
  {id: 100, subject_id: 2, topic: "Nuclear Physics", grade_id: 2},
  
  {id: 101, subject_id: 3, topic: "Advanced Grammar", grade_id: 2},
  {id: 102, subject_id: 3, topic: "Essay Writing Advanced", grade_id: 2},
  {id: 103, subject_id: 3, topic: "Debate Skills", grade_id: 2},
  {id: 104, subject_id: 3, topic: "Novel Studies", grade_id: 2},
  {id: 105, subject_id: 3, topic: "Drama Analysis", grade_id: 2},
  {id: 106, subject_id: 3, topic: "Poetry Deep Study", grade_id: 2},
  {id: 107, subject_id: 3, topic: "Report Writing", grade_id: 2},
  {id: 108, subject_id: 3, topic: "Critical Thinking", grade_id: 2},
  {id: 109, subject_id: 3, topic: "Creative Writing", grade_id: 2},
  {id: 110, subject_id: 3, topic: "Research Skills", grade_id: 2},
  
  {id: 111, subject_id: 4, topic: "Industrial Revolution", grade_id: 2},
  {id: 112, subject_id: 4, topic: "Colonialism", grade_id: 2},
  {id: 113, subject_id: 4, topic: "Indian National Movement", grade_id: 2},
  {id: 114, subject_id: 4, topic: "World War I", grade_id: 2},
  {id: 115, subject_id: 4, topic: "World War II", grade_id: 2},
  {id: 116, subject_id: 4, topic: "Cold War Era", grade_id: 2},
  {id: 117, subject_id: 4, topic: "UN & Global Politics", grade_id: 2},
  {id: 118, subject_id: 4, topic: "Economic History", grade_id: 2},
  {id: 119, subject_id: 4, topic: "Cultural History", grade_id: 2},
  {id: 120, subject_id: 4, topic: "Modern History", grade_id: 2},
  
  {id: 121, subject_id: 5, topic: "Physical Geography Advanced", grade_id: 2},
  {id: 122, subject_id: 5, topic: "Climatology", grade_id: 2},
  {id: 123, subject_id: 5, topic: "Soil & Vegetation", grade_id: 2},
  {id: 124, subject_id: 5, topic: "World Population Patterns", grade_id: 2},
  {id: 125, subject_id: 5, topic: "Agricultural Geography", grade_id: 2},
  {id: 126, subject_id: 5, topic: "Industrial Geography", grade_id: 2},
  {id: 127, subject_id: 5, topic: "Transport & Communication", grade_id: 2},
  {id: 128, subject_id: 5, topic: "Map Projections", grade_id: 2},
  {id: 129, subject_id: 5, topic: "Remote Sensing", grade_id: 2},
  {id: 130, subject_id: 5, topic: "Economic Geography", grade_id: 2},
  
  {id: 131, subject_id: 6, topic: "Perspective Drawing", grade_id: 2},
  {id: 132, subject_id: 6, topic: "Portrait Painting", grade_id: 2},
  {id: 133, subject_id: 6, topic: "Modern Sculpture", grade_id: 2},
  {id: 134, subject_id: 6, topic: "Art Criticism", grade_id: 2},
  {id: 135, subject_id: 6, topic: "Art Movements", grade_id: 2},
  {id: 136, subject_id: 6, topic: "Graphic Design", grade_id: 2},
  {id: 137, subject_id: 6, topic: "Calligraphy", grade_id: 2},
  {id: 138, subject_id: 6, topic: "Digital Illustration", grade_id: 2},
  {id: 139, subject_id: 6, topic: "Photography", grade_id: 2},
  {id: 140, subject_id: 6, topic: "Applied Art", grade_id: 2},
  
  {id: 141, subject_id: 7, topic: "Classical Compositions", grade_id: 2},
  {id: 142, subject_id: 7, topic: "Western Music", grade_id: 2},
  {id: 143, subject_id: 7, topic: "Indian Classical Music", grade_id: 2},
  {id: 144, subject_id: 7, topic: "Folk Traditions", grade_id: 2},
  {id: 145, subject_id: 7, topic: "Jazz & Blues", grade_id: 2},
  {id: 146, subject_id: 7, topic: "Pop & Rock", grade_id: 2},
  {id: 147, subject_id: 7, topic: "Music Technology", grade_id: 2},
  {id: 148, subject_id: 7, topic: "Choir Singing", grade_id: 2},
  {id: 149, subject_id: 7, topic: "Music Theory Advanced", grade_id: 2},
  {id: 150, subject_id: 7, topic: "Composition Skills", grade_id: 2},
  
  {id: 151, subject_id: 8, topic: "Physical Fitness Advanced", grade_id: 2},
  {id: 152, subject_id: 8, topic: "Aerobics", grade_id: 2},
  {id: 153, subject_id: 8, topic: "Martial Arts", grade_id: 2},
  {id: 154, subject_id: 8, topic: "Track & Field", grade_id: 2},
  {id: 155, subject_id: 8, topic: "Team Games Advanced", grade_id: 2},
  {id: 156, subject_id: 8, topic: "Sports Psychology", grade_id: 2},
  {id: 157, subject_id: 8, topic: "Nutrition & Health", grade_id: 2},
  {id: 158, subject_id: 8, topic: "Recreational Games", grade_id: 2},
  {id: 159, subject_id: 8, topic: "First Aid in Sports", grade_id: 2},
  {id: 160, subject_id: 8, topic: "Injury Prevention", grade_id: 2},

  // Grade 12 (grade_id: 3)
  {id: 161, subject_id: 1, topic: "Advanced Calculus", grade_id: 3},
  {id: 162, subject_id: 1, topic: "Integration Techniques", grade_id: 3},
  {id: 163, subject_id: 1, topic: "Differential Equations", grade_id: 3},
  {id: 164, subject_id: 1, topic: "Probability & Statistics", grade_id: 3},
  {id: 165, subject_id: 1, topic: "Vectors", grade_id: 3},
  {id: 166, subject_id: 1, topic: "3D Geometry", grade_id: 3},
  {id: 167, subject_id: 1, topic: "Complex Analysis", grade_id: 3},
  {id: 168, subject_id: 1, topic: "Linear Programming", grade_id: 3},
  {id: 169, subject_id: 1, topic: "Limits & Continuity", grade_id: 3},
  {id: 170, subject_id: 1, topic: "Mathematical Reasoning", grade_id: 3},
  
  {id: 171, subject_id: 2, topic: "Electromagnetism", grade_id: 3},
  {id: 172, subject_id: 2, topic: "Optics", grade_id: 3},
  {id: 173, subject_id: 2, topic: "Modern Physics", grade_id: 3},
  {id: 174, subject_id: 2, topic: "Organic Chemistry Advanced", grade_id: 3},
  {id: 175, subject_id: 2, topic: "Physical Chemistry", grade_id: 3},
  {id: 176, subject_id: 2, topic: "Plant Physiology", grade_id: 3},
  {id: 177, subject_id: 2, topic: "Human Physiology", grade_id: 3},
  {id: 178, subject_id: 2, topic: "Biotechnology", grade_id: 3},
  {id: 179, subject_id: 2, topic: "Genetics & Evolution", grade_id: 3},
  {id: 180, subject_id: 2, topic: "Environmental Studies", grade_id: 3},
  
  {id: 181, subject_id: 3, topic: "Critical Essay Writing", grade_id: 3},
  {id: 182, subject_id: 3, topic: "Advanced Literature", grade_id: 3},
  {id: 183, subject_id: 3, topic: "World Literature", grade_id: 3},
  {id: 184, subject_id: 3, topic: "Shakespeare Studies", grade_id: 3},
  {id: 185, subject_id: 3, topic: "Contemporary Literature", grade_id: 3},
  {id: 186, subject_id: 3, topic: "Linguistics", grade_id: 3},
  {id: 187, subject_id: 3, topic: "Advanced Poetry", grade_id: 3},
  {id: 188, subject_id: 3, topic: "Drama & Theatre", grade_id: 3},
  {id: 189, subject_id: 3, topic: "Research Paper Writing", grade_id: 3},
  {id: 190, subject_id: 3, topic: "Communication Skills", grade_id: 3},
  
  {id: 191, subject_id: 4, topic: "World War II Analysis", grade_id: 3},
  {id: 192, subject_id: 4, topic: "Cold War Politics", grade_id: 3},
  {id: 193, subject_id: 4, topic: "Indian Independence", grade_id: 3},
  {id: 194, subject_id: 4, topic: "Post-Colonial States", grade_id: 3},
  {id: 195, subject_id: 4, topic: "Globalization History", grade_id: 3},
  {id: 196, subject_id: 4, topic: "World Economy", grade_id: 3},
  {id: 197, subject_id: 4, topic: "Modern Political History", grade_id: 3},
  {id: 198, subject_id: 4, topic: "Cultural Revolutions", grade_id: 3},
  {id: 199, subject_id: 4, topic: "Global Conflicts", grade_id: 3},
  {id: 200, subject_id: 4, topic: "Contemporary World", grade_id: 3},
  
  {id: 201, subject_id: 5, topic: "Advanced Climatology", grade_id: 3},
  {id: 202, subject_id: 5, topic: "Oceanography", grade_id: 3},
  {id: 203, subject_id: 5, topic: "Geopolitics", grade_id: 3},
  {id: 204, subject_id: 5, topic: "World Resources", grade_id: 3},
  {id: 205, subject_id: 5, topic: "Industrial Regions", grade_id: 3},
  {id: 206, subject_id: 5, topic: "Population Dynamics", grade_id: 3},
  {id: 207, subject_id: 5, topic: "Settlement Geography", grade_id: 3},
  {id: 208, subject_id: 5, topic: "GIS & Remote Sensing", grade_id: 3},
  {id: 209, subject_id: 5, topic: "Transport Networks", grade_id: 3},
  {id: 210, subject_id: 5, topic: "Global Issues", grade_id: 3},
  
  {id: 211, subject_id: 6, topic: "Advanced Painting", grade_id: 3},
  {id: 212, subject_id: 6, topic: "Abstract Art", grade_id: 3},
  {id: 213, subject_id: 6, topic: "Modern Digital Art", grade_id: 3},
  {id: 214, subject_id: 6, topic: "Art Theory", grade_id: 3},
  {id: 215, subject_id: 6, topic: "Sculpture Advanced", grade_id: 3},
  {id: 216, subject_id: 6, topic: "Graphic Design Advanced", grade_id: 3},
  {id: 217, subject_id: 6, topic: "Animation", grade_id: 3},
  {id: 218, subject_id: 6, topic: "Photography Advanced", grade_id: 3},
  {id: 219, subject_id: 6, topic: "Architecture Basics", grade_id: 3},
  {id: 220, subject_id: 6, topic: "Creative Portfolio", grade_id: 3},
  
  {id: 221, subject_id: 7, topic: "Advanced Music Theory", grade_id: 3},
  {id: 222, subject_id: 7, topic: "Western Classical Music", grade_id: 3},
  {id: 223, subject_id: 7, topic: "Indian Ragas", grade_id: 3},
  {id: 224, subject_id: 7, topic: "Opera & Symphony", grade_id: 3},
  {id: 225, subject_id: 7, topic: "Film Music", grade_id: 3},
  {id: 226, subject_id: 7, topic: "Contemporary Genres", grade_id: 3},
  {id: 227, subject_id: 7, topic: "Music Production", grade_id: 3},
  {id: 228, subject_id: 7, topic: "Sound Engineering", grade_id: 3},
  {id: 229, subject_id: 7, topic: "Musical Composition", grade_id: 3},
  {id: 230, subject_id: 7, topic: "Music History Advanced", grade_id: 3},
  
  {id: 231, subject_id: 8, topic: "Sports Training Methods", grade_id: 3},
  {id: 232, subject_id: 8, topic: "Kinesiology", grade_id: 3},
  {id: 233, subject_id: 8, topic: "Biomechanics", grade_id: 3},
  {id: 234, subject_id: 8, topic: "Sports Injuries", grade_id: 3},
  {id: 235, subject_id: 8, topic: "Advanced Fitness", grade_id: 3},
  {id: 236, subject_id: 8, topic: "Sports Nutrition", grade_id: 3},
  {id: 237, subject_id: 8, topic: "Coaching Skills", grade_id: 3},
  {id: 238, subject_id: 8, topic: "Adventure Sports", grade_id: 3},
  {id: 239, subject_id: 8, topic: "Olympic Games", grade_id: 3},
  {id: 240, subject_id: 8, topic: "Sports Leadership", grade_id: 3}
];

// Subject mappings
const subjects = {
  1: "Mathematics",
  2: "Science", 
  3: "English",
  4: "History",
  5: "Geography",
  6: "Art",
  7: "Music",
  8: "PE"
};

// Grade mappings
const grades = {
  1: "Grade 10",
  2: "Grade 11", 
  3: "Grade 12"
};

// Default options format exactly as you specified
export const defaultOptions = [
  {"id": 1, "text": "1"},
  {"id": 2, "text": "2"}, 
  {"id": 3, "text": "3"},
  {"id": 4, "text": "4"}
];

// Question templates by subject
const questionTemplates = {
  1: [ // Mathematics
    "What is the solution to this {topic} problem?",
    "Find the correct answer for this {topic} question:",
    "Calculate the result in this {topic} scenario:",
    "Solve this {topic} problem:",
    "What is the answer to this {topic} calculation?",
    "Find the value in this {topic} equation:",
    "The result of this {topic} operation is:",
    "Calculate this {topic} expression:",
    "Solve this {topic} equation:",
    "What equals this {topic} calculation?",
    "Find x in this {topic} problem:",
    "The solution to this {topic} is:",
    "Calculate this {topic} value:",
    "What is this {topic} result?",
    "Solve for the unknown in this {topic}:",
    "Find the answer to this {topic}:",
    "What is this {topic} value?",
    "Calculate this {topic} problem:",
    "The answer to this {topic} is:",
    "Solve this {topic} calculation:"
  ],
  2: [ // Science
    "What is the correct {topic} concept?",
    "Which {topic} principle is right?",
    "The correct {topic} answer is:",
    "What represents {topic}?",
    "Which {topic} statement is true?",
    "The {topic} result is:",
    "What shows {topic}?",
    "The correct {topic} option is:",
    "Which {topic} value is right?",
    "What is {topic}?",
    "The correct {topic} answer:",
    "Which {topic} option is true?",
    "What represents {topic} correctly?",
    "The {topic} response is:",
    "Which {topic} is accurate?",
    "What equals {topic}?",
    "The {topic} answer is:",
    "Which {topic} is correct?",
    "What shows {topic} properly?",
    "The correct {topic} value is:"
  ],
  3: [ // English  
    "What is the correct {topic} answer?",
    "Which {topic} option is right?",
    "The {topic} solution is:",
    "What represents {topic}?",
    "Which {topic} choice is correct?",
    "The {topic} answer is:",
    "What shows {topic}?",
    "The correct {topic} response:",
    "Which {topic} is accurate?",
    "What is {topic}?",
    "The {topic} result:",
    "Which {topic} is true?",
    "What represents {topic} correctly?",
    "The {topic} choice is:",
    "Which {topic} statement is right?",
    "What equals {topic}?",
    "The {topic} solution:",
    "Which {topic} is proper?",
    "What shows {topic} correctly?",
    "The correct {topic} is:"
  ],
  4: [ // History
    "What happened in {topic}?",
    "Which {topic} fact is correct?",
    "The {topic} answer is:",
    "What represents {topic}?",
    "Which {topic} statement is true?",
    "The {topic} result was:",
    "What shows {topic}?",
    "The correct {topic} information:",
    "Which {topic} event is accurate?",
    "What occurred in {topic}?",
    "The {topic} fact is:",
    "Which {topic} is historical?",
    "What represents {topic} period?",
    "The {topic} event was:",
    "Which {topic} is documented?",
    "What happened during {topic}?",
    "The {topic} outcome was:",
    "Which {topic} is verified?",
    "What shows {topic} accurately?",
    "The correct {topic} date is:"
  ],
  5: [ // Geography
    "What is located in {topic}?",
    "Which {topic} feature is correct?",
    "The {topic} characteristic is:",
    "What represents {topic}?",
    "Which {topic} fact is true?",
    "The {topic} location is:",
    "What shows {topic}?",
    "The correct {topic} information:",
    "Which {topic} data is accurate?",
    "What defines {topic}?",
    "The {topic} measurement is:",
    "Which {topic} is geographical?",
    "What represents {topic} correctly?",
    "The {topic} feature is:",
    "Which {topic} is mapped?",
    "What occurs in {topic}?",
    "The {topic} pattern is:",
    "Which {topic} is documented?",
    "What shows {topic} clearly?",
    "The correct {topic} value is:"
  ],
  6: [ // Art
    "What technique is used in {topic}?",
    "Which {topic} method is correct?",
    "The {topic} principle is:",
    "What represents {topic}?",
    "Which {topic} style is right?",
    "The {topic} approach is:",
    "What shows {topic}?",
    "The correct {topic} technique:",
    "Which {topic} is artistic?",
    "What defines {topic}?",
    "The {topic} method is:",
    "Which {topic} is creative?",
    "What represents {topic} art?",
    "The {topic} style is:",
    "Which {topic} is visual?",
    "What demonstrates {topic}?",
    "The {topic} form is:",
    "Which {topic} is expressive?",
    "What shows {topic} skill?",
    "The correct {topic} approach is:"
  ],
  7: [ // Music
    "What is the {topic} element?",
    "Which {topic} concept is correct?",
    "The {topic} principle is:",
    "What represents {topic}?",
    "Which {topic} theory is right?",
    "The {topic} structure is:",
    "What shows {topic}?",
    "The correct {topic} notation:",
    "Which {topic} is musical?",
    "What defines {topic}?",
    "The {topic} pattern is:",
    "Which {topic} is harmonic?",
    "What represents {topic} music?",
    "The {topic} rhythm is:",
    "Which {topic} is melodic?",
    "What demonstrates {topic}?",
    "The {topic} scale is:",
    "Which {topic} is composed?",
    "What shows {topic} theory?",
    "The correct {topic} note is:"
  ],
  8: [ // PE
    "What is the {topic} technique?",
    "Which {topic} method is correct?",
    "The {topic} principle is:",
    "What represents {topic}?",
    "Which {topic} rule is right?",
    "The {topic} form is:",
    "What shows {topic}?",
    "The correct {topic} approach:",
    "Which {topic} is physical?",
    "What defines {topic}?",
    "The {topic} movement is:",
    "Which {topic} is athletic?",
    "What represents {topic} fitness?",
    "The {topic} exercise is:",
    "Which {topic} is healthy?",
    "What demonstrates {topic}?",
    "The {topic} skill is:",
    "Which {topic} is competitive?",
    "What shows {topic} ability?",
    "The correct {topic} position is:"
  ]
};

// Function to insert questions directly via database (for backend use)
export async function insertQuestionsToDatabase(pool) {
  console.log('Starting bulk question insertion...');
  let totalInserted = 0;
  let errors = 0;
  
  try {
    for (const topic of allTopics) {
      console.log(`\nProcessing topic: ${topic.topic} (ID: ${topic.id})`);
      
      // Get subject name
      const subjectRes = await pool.query("SELECT subject FROM subjects WHERE id=$1", [topic.subject_id]);
      if (subjectRes.rowCount === 0) {
        console.log(`❌ Subject ID ${topic.subject_id} not found`);
        continue;
      }
      const subjectName = subjectRes.rows[0].subject;
      
      // Get grade level name  
      const gradeRes = await pool.query("SELECT grade_level FROM grades WHERE id=$1", [topic.grade_id]);
      if (gradeRes.rowCount === 0) {
        console.log(`❌ Grade ID ${topic.grade_id} not found`);
        continue;
      }
      const gradeLevelName = gradeRes.rows[0].grade_level;
      
      const templates = questionTemplates[topic.subject_id] || questionTemplates[1];
      
      // Generate 20 questions for this topic
      for (let i = 1; i <= 20; i++) {
        try {
          const templateIndex = (i - 1) % templates.length;
          let questionText = templates[templateIndex].replace('{topic}', topic.topic);
          
          // Random correct option (1-4)
          const correctOptionId = Math.floor(Math.random() * 4) + 1;
          
          // Determine difficulty based on question number
          let difficulty;
          if (i <= 7) difficulty = "Easy";
          else if (i <= 14) difficulty = "Medium";
          else difficulty = "Hard";
          
          // Insert question directly into database
          const query = `
            INSERT INTO questions (
              subject, question_text, options, correct_option_id, created_at, 
              difficulty_level, grade_level, question_type, question_url, 
              topic_id, answer_explanation, answer_file_url, topics
            ) VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8, $9, $10, $11, $12) 
            RETURNING *;
          `;
          
          const values = [
            subjectName, // subject
            questionText, // question_text
            JSON.stringify(defaultOptions), // options
            correctOptionId, // correct_option_id
            difficulty, // difficulty_level
            gradeLevelName, // grade_level
            "mcq", // question_type
            null, // question_url
            topic.id, // topic_id
            `This is the explanation for ${topic.topic} question ${i}. The correct answer is option ${correctOptionId}.`, // answer_explanation
            null, // answer_file_url
            topic.topic // topics
          ];
          
          const result = await pool.query(query, values);
          
          if (result.rows.length > 0) {
            totalInserted++;
            console.log(`✅ Question ${i} inserted successfully (ID: ${result.rows[0].id})`);
          }
          
        } catch (error) {
          errors++;
          console.log(`❌ Failed to insert question ${i}:`, error.message);
        }
      }
      
      console.log(`Completed topic: ${topic.topic} - Inserted: 20 questions`);
    }
    
    console.log(`\n=== INSERTION COMPLETE ===`);
    console.log(`Total questions inserted: ${totalInserted}`);
    console.log(`Total errors: ${errors}`);
    console.log(`Expected total: ${allTopics.length * 20} (${allTopics.length} topics × 20 questions)`);
    
  } catch (error) {
    console.error('Error in bulk insertion:', error);
  }
}

// Function to test with single question insertion
export async function testSingleInsertion(pool) {
  try {
    const testTopic = allTopics[0]; // First topic
    
    // Get subject name
    const subjectRes = await pool.query("SELECT subject FROM subjects WHERE id=$1", [testTopic.subject_id]);
    const subjectName = subjectRes.rows[0].subject;
    
    // Get grade level name  
    const gradeRes = await pool.query("SELECT grade_level FROM grades WHERE id=$1", [testTopic.grade_id]);
    const gradeLevelName = gradeRes.rows[0].grade_level;
    
    const questionText = `Test question for ${testTopic.topic}`;
    const correctOptionId = 2;
    
    const query = `
      INSERT INTO questions (
        subject, question_text, options, correct_option_id, created_at, 
        difficulty_level, grade_level, question_type, question_url, 
        topic_id, answer_explanation, answer_file_url, topics
      ) VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8, $9, $10, $11, $12) 
      RETURNING *;
    `;
    
    const values = [
      subjectName,
      questionText,
      JSON.stringify(defaultOptions),
      correctOptionId,
      "Easy",
      gradeLevelName,
      "mcq",
      null,
      testTopic.id,
      `Test explanation for ${testTopic.topic}. The correct answer is option ${correctOptionId}.`,
      null,
      testTopic.topic
    ];
    
    const result = await pool.query(query, values);
    console.log('✅ Test question inserted:', result.rows[0]);
    return result.rows[0];
    
  } catch (error) {
    console.error('❌ Test insertion failed:', error);
    return null;
  }
}

// Export functions for use in your backend

//   insertQuestionsToDatabase,
//   testSingleInsertion,
//   allTopics,
//   defaultOptions

// Usage in your backend:
// 1. Import this file: const { insertQuestionsToDatabase, testSingleInsertion } = require('./path-to-this-file');
//  await testSingleInsertion(pool);
// await insertQuestionsToDatabase(pool);

// console.log("=== BACKEND QUESTION INSERTION SCRIPT ===");
// console.log("Total topics:", allTopics.length);
// console.log("Questions per topic: 20");
// console.log("Total questions to be inserted:", allTopics.length * 20);
// console.log("\nTo use:");
// console.log("1. Import this module in your backend");
// console.log("2. Call testSingleInsertion(pool) first to test");
// console.log("3. Call insertQuestionsToDatabase(pool) to insert all questions");

app.listen(PORT, () => console.log(`server started on this port http://localhost:${PORT}`))