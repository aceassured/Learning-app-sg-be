export const sendNotification = async (io, userId, message, type = "general", pool) => {
  try {
    const query = `
      INSERT INTO notifications (user_id, message, type, is_read, viewed)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *`;
    
    const values = [userId, message, type, false, false];
    const result = await pool.query(query, values);
    const notification = result.rows[0];

    // Emit real-time notification if user is online
    if (io && io.sockets.sockets.size > 0) {
      // Find user's socket
      const sockets = Array.from(io.sockets.sockets.values());
      const userSocket = sockets.find(socket => socket.userId === userId);
      
      if (userSocket) {
        io.to(userSocket.id).emit("notification", notification);
        console.log(`📨 Sent real-time notification to user ${userId}`);
      }
    }

    return notification;
  } catch (err) {
    console.error("❌ Failed to send notification:", err);
    return null;
  }
};
