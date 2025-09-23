import pool from "../../database.js";

export const sendNotificationToUser = async (userId, message) => {
  try {
    const playerRes = await pool.query(
      "SELECT player_id FROM user_push_tokens WHERE user_id = $1 AND subscribed = true",
      [userId]
    );

    if (!playerRes.rowCount) {
      console.log(`No subscribed playerId found for user ${userId}`);
      return;
    }

    const playerIds = playerRes.rows.map(r => r.player_id);
    console.log("Fetched playerIds from DB:", playerIds);

    // ✅ Filter only active subscribed players
    const confirmedPlayerIds = [];
    for (const id of playerIds) {
      const res = await fetch(
        `https://onesignal.com/api/v1/players/${id}?app_id=${process.env.ONESIGNAL_APP_ID}`,
        { headers: { Authorization: `Basic ${process.env.ONESIGNAL_REST_API_KEY}` } }
      );
      const data = await res.json();
      if (!data.unsubscribed && !data.errors) {
        confirmedPlayerIds.push(id);
      }
    }

    if (!confirmedPlayerIds.length) {
      console.log("No active subscribed players to send notification to");
      return;
    }

    console.log("Sending to confirmed playerIds:", confirmedPlayerIds);

    // ✅ Send notification only to confirmed players
    const response = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": `Basic ${process.env.ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify({
        app_id: process.env.ONESIGNAL_APP_ID,
        include_player_ids: confirmedPlayerIds,
        headings: { en: "AceHive" },
        contents: { en: message },
      }),
    });

    const data = await response.json();
    console.log("OneSignal response:", data);

  } catch (err) {
    console.error("Error sending notification:", err);
  }
};
