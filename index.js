// import express from "express";
// import dotenv from "dotenv";
// import cors from "cors";
// import helmet from "helmet";
// import pool from "./database.js";
// import userRouter from "./src/router/userrouter.js";
// import quizRouter from "./src/router/quizrouter.js";
// import forumRouter from "./src/router/forumrouter.js";
// import progressStates from "./src/router/progressRoutes.js";
// import adminRouter from "./src/router/adminrouter.js";
// import notificationRouter from "./src/router/notificationRouter.js"; // Add this
// import fs from "fs";
// import { exec } from "child_process";
// import http from "http";
// import { Server } from "socket.io";
// import auth from "./src/middleware/auth.js";

// dotenv.config({ quiet: true });

// const app = express();
// const PORT = process.env.PORT || 5959;

// app.use(express.urlencoded({ extended: true }));
// app.use(express.json());
// app.use(helmet());

// const corsOptions = {
//   origin: "https://ace-hive-production-fe.vercel.app", // ONLY your frontend
//   methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
//   allowedHeaders: ["Content-Type", "Authorization", "auth"],
//   credentials: true,
//   optionsSuccessStatus: 200,
// };

// app.use(cors(corsOptions));

// // Routes
// app.use("/api/user", userRouter);
// app.use("/api/quiz", quizRouter);
// app.use("/api/forum", forumRouter);
// app.use("/api/progress", progressStates);
// app.use("/api/admin", adminRouter);
// app.use("/api/notifications", notificationRouter); // Add notifications route

// app.get("/", async (req, res) => {
//   try {
//     res.status(200).json("Learning App Backend Connected.......!");
//   } catch (error) {
//     console.log("error", error);
//   }
// });

// // --- SOCKET.IO SETUP ---
// const server = http.createServer(app);
// export const io = new Server(server, {
//   cors: {
//     origin: corsOptions.origin,
//     methods: ["GET", "POST"],
//     credentials: true,
//   },
// });

// // Store online users: userId -> socketId
// global.onlineUsers = {}; // Make it global so controller can access it

// io.on("connection", (socket) => {
//   console.log("✅ User connected:", socket.id);

//   socket.on("register", (userId) => {
//     socket.userId = userId;
//     global.onlineUsers[userId] = socket.id;
//     console.log(`📡 User ${userId} registered with socket ${socket.id}`);
//   });

//   socket.on("disconnect", () => {
//     console.log("❌ User disconnected:", socket.id);
//     if (socket.userId) {
//       delete global.onlineUsers[socket.userId];
//     }
//   });
// });

// // Legacy API endpoints (keeping for backward compatibility)
// app.post("/api/send-notification", async (req, res) => {
//   const { userId, message, type, subject } = req.body;

//   if (!userId || !message) {
//     return res.status(400).json({ error: "userId and message are required" });
//   }

//   try {
//     const query = `
//       INSERT INTO notifications (user_id, message, type, subject, is_read, is_viewed) 
//       VALUES ($1, $2, $3, $4, false, false) 
//       RETURNING *
//     `;
//     const values = [userId, message, type || "general", subject || null];
//     const result = await pool.query(query, values);

//     const notification = {
//       ...result.rows[0],
//       read: false,
//       viewed: false,
//       time_section: 'today'
//     };

//     if (global.onlineUsers[userId]) {
//       io.to(global.onlineUsers[userId]).emit("notification", notification);
//       console.log(`📨 Sent real-time notification to user ${userId}`);
//     }

//     res.json({ success: true, notification });
//   } catch (error) {
//     console.error("❌ Error sending notification:", error);
//     res.status(500).json({ error: "Failed to send notification" });
//   }
// });

// // Legacy get notifications endpoint
// app.get("/api/notifications", async (req, res) => {
//   const userId = req.query.userId;
  
//   if (!userId) return res.status(400).json({ error: "Missing userId" });

//   try {
//     const result = await pool.query(
//       `SELECT 
//         id, 
//         user_id, 
//         message, 
//         type, 
//         subject, 
//         is_read, 
//         is_viewed, 
//         created_at,
//         CASE 
//           WHEN created_at >= CURRENT_DATE THEN 'today'
//           WHEN created_at >= CURRENT_DATE - INTERVAL '7 days' THEN 'thisWeek'
//           ELSE 'earlier'
//         END as time_section
//        FROM notifications 
//        WHERE user_id = $1 
//        ORDER BY created_at DESC`,
//       [userId]
//     );

//     const notifications = result.rows.map(notification => ({
//       ...notification,
//       read: notification.is_read,
//       viewed: notification.is_viewed
//     }));

//     const unreadCount = notifications.filter(n => !n.is_read).length;

//     res.json({ notifications, unreadCount });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: "Failed to fetch notifications" });
//   }
// });

// // Legacy mark as read endpoint
// app.put("/api/notifications/mark-as-read", async (req, res) => {
//   const { userId, ids } = req.body;
  
//   try {
//     await pool.query(
//       "UPDATE notifications SET is_read = true WHERE user_id=$1 AND id = ANY($2::int[])",
//       [userId, ids]
//     );
//     res.json({ success: true });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ error: "Failed to mark as read" });
//   }
// });

// // ✅ IMPORTANT: Use server.listen, not app.listen
// server.listen(PORT, () => {
//   console.log(`🚀 Server running on http://localhost:${PORT}`);
// });



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
import notificationRouter from "./src/router/notificationRouter.js";
import http from "http";
import { Server } from "socket.io";
import { initializeNotificationServices } from "./src/services/notificationService.js";

dotenv.config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 5959;

// --- MIDDLEWARE ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(helmet());

const corsOptions = {
  origin: [
    "https://ace-hive-production-fe.vercel.app",
    "http://localhost:5173",
    "http://localhost:8000",
    "https://learning-app-admin-fe.vercel.app"
  ], // allow multiple frontends
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "auth"],
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

// --- ROUTES ---
app.use("/api/user", userRouter);
app.use("/api/quiz", quizRouter);
app.use("/api/forum", forumRouter);
app.use("/api/progress", progressStates);
app.use("/api/admin", adminRouter);
app.use("/api/notifications", notificationRouter);



// FCM Token registration endpoint
app.post("/api/user/register-fcm-token", async (req, res) => {
  const { userId, fcmToken, deviceType } = req.body;
  
  if (!userId || !fcmToken) {
    return res.status(400).json({ error: "userId and fcmToken are required" });
  }

  try {
    await pool.query(
      "UPDATE users SET fcm_token = $1, device_type = $2 WHERE id = $3",
      [fcmToken, deviceType || 'web', userId]
    );
    
    console.log(`✅ FCM token registered for user ${userId}`);
    res.json({ success: true, message: "FCM token registered" });
  } catch (error) {
    console.error("❌ Error registering FCM token:", error);
    res.status(500).json({ error: "Failed to register FCM token" });
  }
});

// Update user reminder settings
app.post("/api/user/reminder-settings", async (req, res) => {
  const { userId, reminderEnabled, reminderTime } = req.body;
  
  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  try {
    await pool.query(
      "UPDATE users SET reminder_enabled = $1, reminder_time = $2 WHERE id = $3",
      [reminderEnabled, reminderTime, userId]
    );
    
    console.log(`✅ Reminder settings updated for user ${userId}`);
    res.json({ success: true, message: "Reminder settings updated" });
  } catch (error) {
    console.error("❌ Error updating reminder settings:", error);
    res.status(500).json({ error: "Failed to update reminder settings" });
  }
});


app.get("/", (req, res) => {
  res.status(200).json("Learning App Backend Connected.......!");
});

// --- SOCKET.IO SETUP ---
const server = http.createServer(app);
export const io = new Server(server, {
  cors: {
    origin: "https://ace-hive-production-fe.vercel.app",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

global.onlineUsers = new Map(); // Using Map instead of object for better performance

io.on("connection", (socket) => {
  console.log("✅ User connected:", socket.id);

  // Handle user registration
  socket.on("register", (userId) => {
    // ✅ CRITICAL: Check if user already has an active connection
    if (global.onlineUsers.has(userId)) {
      const existingSocketId = global.onlineUsers.get(userId);
      const existingSocket = io.sockets.sockets.get(existingSocketId);
      
      // Disconnect the old socket to prevent duplicates
      if (existingSocket && existingSocket.id !== socket.id) {
        console.log(`⚠️ User ${userId} already connected. Disconnecting old socket: ${existingSocketId}`);
        existingSocket.disconnect(true);
      }
    }

    // Register the new socket
    socket.userId = userId;
    global.onlineUsers.set(userId, socket.id);
    console.log(`📡 User ${userId} registered with socket ${socket.id}`);
    console.log(`👥 Total online users: ${global.onlineUsers.size}`);

    // Join a room for this user (useful for targeted notifications)
    socket.join(`user_${userId}`);
  });

  // Handle manual disconnect
  socket.on("disconnect", (reason) => {
    console.log(`❌ User disconnected: ${socket.id} | Reason: ${reason}`);
    
    if (socket.userId) {
      // Only delete if this is the current socket for this user
      const currentSocketId = global.onlineUsers.get(socket.userId);
      if (currentSocketId === socket.id) {
        global.onlineUsers.delete(socket.userId);
        console.log(`🗑️ Removed user ${socket.userId} from online users`);
      }
    }
    
    console.log(`👥 Total online users: ${global.onlineUsers.size}`);
  });

  // Handle connection errors
  socket.on("error", (error) => {
    console.error(`❌ Socket error for ${socket.id}:`, error);
  });

  // Optional: Handle reconnection attempts
  socket.on("reconnect_attempt", () => {
    console.log(`🔄 Reconnection attempt from ${socket.id}`);
  });
});

// --- NOTIFICATIONS (Legacy) ---
app.post("/api/send-notification", async (req, res) => {
  const { userId, message, type, subject } = req.body;
  if (!userId || !message)
    return res.status(400).json({ error: "userId and message are required" });

  try {
    const query = `
      INSERT INTO notifications (user_id, message, type, subject, is_read, is_viewed) 
      VALUES ($1, $2, $3, $4, false, false) RETURNING *
    `;
    const values = [userId, message, type || "general", subject || null];
    const result = await pool.query(query, values);
    const notification = { ...result.rows[0], read: false, viewed: false, time_section: "today" };

    if (global.onlineUsers[userId])
      io.to(global.onlineUsers[userId]).emit("notification", notification);

    res.json({ success: true, notification });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to send notification" });
  }
});

app.get("/api/notifications", async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: "Missing userId" });

  try {
    const result = await pool.query(
      `SELECT 
        id, user_id, message, type, subject, is_read, is_viewed, created_at,
        CASE 
          WHEN created_at >= CURRENT_DATE THEN 'today'
          WHEN created_at >= CURRENT_DATE - INTERVAL '7 days' THEN 'thisWeek'
          ELSE 'earlier'
        END AS time_section
       FROM notifications 
       WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );

    const notifications = result.rows.map(n => ({ ...n, read: n.is_read, viewed: n.is_viewed }));
    const unreadCount = notifications.filter(n => !n.is_read).length;

    res.json({ notifications, unreadCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

app.put("/api/notifications/mark-as-read", async (req, res) => {
  const { userId, ids } = req.body;
  try {
    await pool.query(
      "UPDATE notifications SET is_read = true WHERE user_id=$1 AND id = ANY($2::int[])",
      [userId, ids]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to mark as read" });
  }
});

// --- GLOBAL ERROR HANDLING ---
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ success: false, message: err.message || "Server error" });
});

// ✅ START SERVER
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
   initializeNotificationServices();
});
