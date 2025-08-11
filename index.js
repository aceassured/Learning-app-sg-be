import express from "express"
import dotenv from "dotenv"
import cors from "cors"
import helmet from "helmet"
import pool from "./database.js"

dotenv.config({ quiet: true })

const app =express()
    
const PORT = process.env.PORT || 5959

app.use(express.urlencoded({ extended: true }));
app.use(express.json())
app.use(helmet())


const corsOptions = {
    origin: [
        'http://localhost:5173', 
        'http://localhost:3000',
    ],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: ['Content-Type', 'Authorization', 'auth'],
    credentials: true, 
    optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));


app.get("/",async(req,res)=>{
    try {
        res.status(200).json("Learning App Backend Connected.......!")
        
    } catch (error) {
        console.log("error",error)
    }
})
  

app.listen(PORT,()=>console.log(`server started on this port http://localhost:${PORT}`))