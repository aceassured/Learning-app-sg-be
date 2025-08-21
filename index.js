import express from "express"
import dotenv from "dotenv"
import cors from "cors"
import helmet from "helmet"
import pool from "./database.js"
import userRouter from "./src/router/userrouter.js"
import quizRouter from "./src/router/quizrouter.js"
import forumRouter from "./src/router/forumrouter.js"
import progressStates from "./src/router/progressRoutes.js"

dotenv.config({ quiet: true })

const app = express()

const PORT = process.env.PORT || 5959

app.use(express.urlencoded({ extended: true }));
app.use(express.json())
app.use(helmet())


const corsOptions = {
    origin: [
        'https://learing-app-sg-fe.vercel.app',
        'http://localhost:5173',
        'http://localhost:3000',
        'http://localhost:8000',
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


app.get("/", async (req, res) => {
    try {
        res.status(200).json("Learning App Backend Connected.......!")

    } catch (error) {
        console.log("error", error)
    }
})


// const templates = {
//   "Mathematics": [
//     { question: "What is the value of π (pi) approximately?", answer: "3.14" },
//     { question: "What is 12 × 12?", answer: "144" },
//     { question: "What is the square root of 64?", answer: "8" },
//     { question: "What is the perimeter of a square with side 5 cm?", answer: "20 cm" },
//     { question: "What is the value of 7³?", answer: "343" },
//   ],
//   "Science": [
//     { question: "What is the boiling point of water (in °C)?", answer: "100°C" },
//     { question: "Which planet is known as the 'Red Planet'?", answer: "Mars" },
//     { question: "What gas do plants absorb from the air?", answer: "Carbon dioxide" },
//     { question: "What is the chemical symbol for gold?", answer: "Au" },
//     { question: "What is the smallest unit of life?", answer: "Cell" },
//   ],
//   "Art": [
//     { question: "Who painted the Mona Lisa?", answer: "Leonardo da Vinci" },
//     { question: "Which art movement is Pablo Picasso associated with?", answer: "Cubism" },
//     { question: "What type of paint did Vincent van Gogh mostly use?", answer: "Oil paint" },
//     { question: "What is the art of paper folding called?", answer: "Origami" },
//     { question: "In which country did the Renaissance begin?", answer: "Italy" },
//   ],
//   "History": [
//     { question: "Who was the first President of the United States?", answer: "George Washington" },
//     { question: "Who was the first President of India?", answer: "Dr. Rajendra Prasad" },
//     { question: "In which year did World War II end?", answer: "1945" },
//     { question: "Who discovered America in 1492?", answer: "Christopher Columbus" },
//     { question: "Which civilization built the Pyramids?", answer: "Egyptians" },
//   ],
//   "PE(Physical education)": [
//     { question: "How many players are there in a football (soccer) team?", answer: "11" },
//     { question: "What is the national sport of Japan?", answer: "Sumo Wrestling" },
//     { question: "How long is an Olympic swimming pool?", answer: "50 meters" },
//     { question: "How many rings are there in the Olympic symbol?", answer: "5" },
//     { question: "In which sport is a shuttlecock used?", answer: "Badminton" },
//   ],
//   "English": [
//     { question: "What is the synonym of 'Happy'?", answer: "Joyful" },
//     { question: "What is the antonym of 'Hot'?", answer: "Cold" },
//     { question: "Which is the plural form of 'Child'?", answer: "Children" },
//     { question: "What is the past tense of 'Go'?", answer: "Went" },
//     { question: "Which article is used before a vowel sound?", answer: "An" },
//   ],
//   "Music": [
//     { question: "Which musical instrument has black and white keys?", answer: "Piano" },
//     { question: "Who is known as the 'King of Pop'?", answer: "Michael Jackson" },
//     { question: "How many strings does a standard guitar have?", answer: "6" },
//     { question: "Which clef is also called the 'G clef'?", answer: "Treble clef" },
//     { question: "Who composed the 'Fur Elise'?", answer: "Beethoven" },
//   ],
//   "Geography": [
//     { question: "How many continents are there in the world?", answer: "7" },
//     { question: "Which is the longest river in the world?", answer: "Nile" },
//     { question: "Which is the largest continent by area?", answer: "Asia" },
//     { question: "Which is the largest ocean in the world?", answer: "Pacific Ocean" },
//     { question: "What is the capital city of Australia?", answer: "Canberra" },
//   ],
// };


// function shuffle(arr) {
//   return arr.sort(() => Math.random() - 0.5);
// }

// function generateOptions(correct, allPossible) {
//   const distractors = shuffle(allPossible.filter(x => x !== correct)).slice(0, 3);
//   const options = shuffle([correct, ...distractors]);
//   return options.map((text, idx) => ({ id: idx + 1, text }));
// }

// async function insertQuestions() {
//   try {
//     for (const [subject, tmplList] of Object.entries(templates)) {
//       const allAnswers = tmplList.map(t => t.answer);
//       for (let i = 0; i < 100; i++) {
//         const tmpl = tmplList[i % tmplList.length];
//         const opts = generateOptions(tmpl.answer, allAnswers);
//         const correctOption = opts.find(o => o.text === tmpl.answer).id;

//         await pool.query(
//           `INSERT INTO questions (subject, question_text, options, correct_option_id, created_at)
//            VALUES ($1, $2, $3, $4, NOW())`,
//           [subject, tmpl.question, JSON.stringify(opts), correctOption]
//         );
//       }
//       console.log(`Inserted 100 questions for ${subject}`);
//     }
//   } catch (err) {
//     console.error("Error inserting questions:", err);
//   } finally {
//     await pool.end();
//   }
// }

// insertQuestions();

app.listen(PORT, () => console.log(`server started on this port http://localhost:${PORT}`))