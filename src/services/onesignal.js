import fetch from "node-fetch";

export const sendNotificationToUser = async (userId, message) => {
  try {
    // ✅ Get player IDs for this user
    const playerRes = await pool.query(
      "SELECT player_id FROM user_push_tokens WHERE user_id = $1",
      [userId]
    );

    if (!playerRes.rowCount) {
      console.log(`No playerId found for user ${userId}`);
      return;
    }

    const playerIds = playerRes.rows.map(r => r.player_id);

    // ✅ Call OneSignal REST API
    await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": "Basic os_v2_app_tyn3vfn55bdphpcmlvkd3ca45p22wiou3ouephvueyjfwxvo5erfkhadc4wt3fbsgvy5evjtslirgo4br7u4d2fwxqjdf25kdbjhqzy", // ⚠️ Use REST API Key, NOT appId
      },
      body: JSON.stringify({
        app_id: "9e1bba95-bde8-46f3-bc4c-5d543d881ceb",
        include_player_ids: playerIds,
        contents: { en: message },
      }),
    });

    console.log(`Notification sent to user ${userId}`);
  } catch (err) {
    console.error("Error sending notification:", err);
  }
};
