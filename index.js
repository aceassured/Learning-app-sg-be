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

const app =express()
    
const PORT = process.env.PORT || 5959

app.use(express.urlencoded({ extended: true }));
app.use(express.json())
app.use(helmet())


const corsOptions = {
    origin: [
        'https://learing-app-sg-fe.vercel.app',
        'http://localhost:5173', 
        'http://localhost:3000',
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


app.get("/",async(req,res)=>{
    try {
        res.status(200).json("Learning App Backend Connected.......!")
        
    } catch (error) {
        console.log("error",error)
    }
})
  

app.listen(PORT,()=>console.log(`server started on this port http://localhost:${PORT}`))