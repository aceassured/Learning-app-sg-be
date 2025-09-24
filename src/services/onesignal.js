import pool from "../../database.js";

export const sendNotificationToUser = async (userId, message) => {
  try {
    console.log(`Starting notification process for user ${userId}`);
    
    // ✅ Get player ID from database
    const playerRes = await pool.query(
      "SELECT player_id FROM user_push_tokens WHERE user_id = $1 AND subscribed = true ORDER BY created_at DESC LIMIT 1",
      [userId]
    );

    if (!playerRes.rowCount) {
      console.log(`No subscribed playerId found for user ${userId}`);
      return { success: false, error: "No subscribed players found" };
    }

    const playerId = playerRes.rows[0].player_id;
    console.log("Found playerId:", playerId);

    // ✅ CRITICAL: Verify player subscription with OneSignal API first
    const verificationResult = await verifyPlayerSubscription(playerId);
    console.log("Player verification result:", verificationResult);

    if (!verificationResult.isValid || !verificationResult.isSubscribed) {
      console.log("Player is not properly subscribed, updating database...");
      await pool.query(
        "UPDATE user_push_tokens SET subscribed = false, last_error = $1, updated_at = now() WHERE player_id = $2",
        ["Player verification failed", playerId]
      );
      return { success: false, error: "Player not subscribed", needsRefresh: true };
    }

    // ✅ Send notification using verified player ID
    console.log("Player verified, sending notification...");
    const response = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": `Basic ${process.env.ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify({
        app_id: process.env.ONESIGNAL_APP_ID,
        include_player_ids: [playerId], // Use only the verified player ID
        headings: { en: "Quiz Complete! 🎉" },
        contents: { en: message },
        // ✅ Add more delivery options
        data: { 
          type: "quiz_complete",
          userId: userId.toString(),
          timestamp: new Date().toISOString()
        },
        // ✅ Ensure immediate delivery
        send_after: new Date().toISOString(),
        priority: 10,
        // ✅ Add web-specific options
        web_buttons: [{
          id: "view_results",
          text: "View Results",
          icon: "https://onesignal.com/images/notification_logo.png",
          url: window.location ? window.location.origin + "/dashboard" : "/"
        }],
        url: window.location ? window.location.origin + "/dashboard" : "/",
        // ✅ Chrome/Firefox specific settings
        chrome_web_icon: "https://onesignal.com/images/notification_logo.png",
        firefox_icon: "https://onesignal.com/images/notification_logo.png"
      }),
    });

    const data = await response.json();
    console.log("OneSignal API response:", data);

    if (data.errors && data.errors.length > 0) {
      console.error("OneSignal errors:", data.errors);
      
      // ✅ Update database with error info
      await pool.query(
        "UPDATE user_push_tokens SET last_error = $1, updated_at = now() WHERE player_id = $2",
        [data.errors.join(", "), playerId]
      );
      
      return { success: false, error: data.errors.join(", ") };
    }

    // ✅ Log successful notification
    if (data.id) {
      console.log(`Notification sent successfully. ID: ${data.id}, Recipients: ${data.recipients}`);
      await pool.query(
        "UPDATE user_push_tokens SET last_notification_sent = now(), last_error = NULL WHERE player_id = $1",
        [playerId]
      );
      return { 
        success: true, 
        notificationId: data.id, 
        recipients: data.recipients,
        playerId: playerId 
      };
    }

    return { success: false, error: "Unknown error occurred" };

  } catch (err) {
    console.error("Error sending notification:", err);
    return { success: false, error: err.message };
  }
};

// ✅ Enhanced player verification function
export const verifyPlayerSubscription = async (playerId) => {
  try {
    console.log(`Verifying player subscription for: ${playerId}`);
    
    const response = await fetch(`https://onesignal.com/api/v1/players/${playerId}?app_id=${process.env.ONESIGNAL_APP_ID}`, {
      method: "GET",
      headers: {
        "Authorization": `Basic ${process.env.ONESIGNAL_REST_API_KEY}`,
      },
    });

    if (!response.ok) {
      console.error(`HTTP Error ${response.status}: ${response.statusText}`);
      return { isValid: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    console.log(`Player ${playerId} data:`, {
      valid: !data.errors,
      subscribed: data.notification_types > 0,
      lastSeen: data.last_active,
      sessionCount: data.session_count,
      testType: data.test_type
    });
    
    if (data.errors) {
      return { isValid: false, error: data.errors.join(", ") };
    }
    
    return {
      isValid: true,
      isSubscribed: data.notification_types && data.notification_types > 0,
      lastSeen: data.last_active,
      sessionCount: data.session_count,
      testType: data.test_type
    };
  } catch (err) {
    console.error("Error verifying player subscription:", err);
    return { isValid: false, error: err.message };
  }
};

// ✅ Add a function to refresh subscription status
export const refreshPlayerSubscription = async (userId) => {
  try {
    const playerRes = await pool.query(
      "SELECT player_id FROM user_push_tokens WHERE user_id = $1",
      [userId]
    );

    if (!playerRes.rowCount) return { success: false, error: "No player found" };

    const playerId = playerRes.rows[0].player_id;
    const verification = await verifyPlayerSubscription(playerId);
    
    // Update database with current subscription status
    await pool.query(
      "UPDATE user_push_tokens SET subscribed = $1, updated_at = now() WHERE player_id = $2",
      [verification.isValid && verification.isSubscribed, playerId]
    );

    return { success: true, verification };
  } catch (err) {
    console.error("Error refreshing subscription:", err);
    return { success: false, error: err.message };
  }
};