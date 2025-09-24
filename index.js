import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import pool from "./database.js";
import userRouter from "./src/router/userrouter.js";
import quizRouter from "./src/router/quizrouter.js";
import forumRouter from "./src/router/forumrouter.js";
import progressStates from "./src/router/progressRoutes.js";
import adminRouter from "./src/router/adminrouter.js";
import fs from "fs";
import { exec } from "child_process";
import http from "http";
import { Server } from "socket.io";

dotenv.config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 5959;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(helmet());

const corsOptions = {
  origin: [
    "https://learing-app-sg-fe.vercel.app",
    "https://learning-app-admin-fe.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:8000",
    "http://localhost:8001",
    "https://ace-hive-production-fe.vercel.app",
  ],
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  allowedHeaders: ["Content-Type", "Authorization", "auth"],
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

app.use("/api/user", userRouter);
app.use("/api/quiz", quizRouter);
app.use("/api/forum", forumRouter);
app.use("/api/progress", progressStates);
app.use("/api/admin", adminRouter);

app.get("/", async (req, res) => {
  try {
    res.status(200).json("Learning App Backend Connected.......!");
  } catch (error) {
    console.log("error", error);
  }
});

// --- SOCKET.IO SETUP ---
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: corsOptions.origin,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Store online users: userId -> socketId
let onlineUsers = {};

io.on("connection", (socket) => {
  console.log("✅ User connected:", socket.id);

  socket.on("register", (userId) => {
    onlineUsers[userId] = socket.id;
    console.log(`📡 User ${userId} registered with socket ${socket.id}`);
  });

  socket.on("disconnect", () => {
    console.log("❌ User disconnected:", socket.id);
    for (let userId in onlineUsers) {
      if (onlineUsers[userId] === socket.id) {
        delete onlineUsers[userId];
      }
    }
  });
});

// --- API: Send Notification ---
app.post("/api/send-notification", async (req, res) => {
  const { userId, message, type } = req.body;

  if (!userId || !message) {
    return res.status(400).json({ error: "userId and message are required" });
  }

  try {
    const query = `
      INSERT INTO notifications (user_id, message, type)
      VALUES ($1, $2, $3) RETURNING *`;
    const values = [userId, message, type || "general"];
    const result = await pool.query(query, values);
    const notification = result.rows[0];

    if (onlineUsers[userId]) {
      io.to(onlineUsers[userId]).emit("notification", notification);
      console.log(`📨 Sent real-time notification to user ${userId}`);
    }

    res.json({ success: true, notification });
  } catch (error) {
    console.error("❌ Error sending notification:", error);
    res.status(500).json({ error: "Failed to send notification" });
  }
});

// ✅ IMPORTANT: Use server.listen, not app.listen
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
