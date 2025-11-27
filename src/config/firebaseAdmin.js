// src/config/firebaseAdmin.js
import admin from 'firebase-admin';
import dotenv from "dotenv"
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config({quiet:true})

const serviceAccount = {
  type: process.env.FIREBASE_TYPE,
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI,
  token_uri: process.env.FIREBASE_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
  client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
};

if (serviceAccount.private_key) {
  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
}
console.log("  serviceAccount.private_key",  serviceAccount.private_key)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

console.log("Has literal \\n:", process.env.FIREBASE_PRIVATE_KEY.includes("\\n"));
console.log("Has real newline:", process.env.FIREBASE_PRIVATE_KEY.includes("\n"));


export const messaging = admin.messaging();

/**
 * Send push notification to a single user
 * @param {string} fcmToken - User's FCM token
 * @param {object} notification - Notification data
 */
export const sendPushNotification = async (fcmToken, notification) => {
  if (!fcmToken) {
    console.log('❌ No FCM token provided');
    return { success: false, error: 'No FCM token' };
  }

  try {
    const message = {
      token: fcmToken,
      notification: {
        title: notification.title || 'Acehive',
        body: notification.message,
        // ✅ Removed icon and badge from here
      },
      data: {
        type: notification.type || 'general',
        subject: notification.subject || '',
        url: notification.url || '/',
        click_action: notification.click_action || 'FLUTTER_NOTIFICATION_CLICK',
      },
      webpush: {
        fcm_options: {
          link: notification.url || '/',
        },
        notification: {
          // ✅ Keep icon and badge only here
          icon: '/android-icon-192x192.png',
          badge: '/android-icon-96x96.png',
          vibrate: [200, 100, 200],
          requireInteraction: true,
        },
      },
    };

    const response = await messaging.send(message);
    console.log('✅ Push notification sent:', response);
    return { success: true, messageId: response };
  } catch (error) {
    console.error('❌ Error sending push notification:', error);

    if (
      error.code === 'messaging/invalid-registration-token' ||
      error.code === 'messaging/registration-token-not-registered'
    ) {
      return { success: false, error: 'Invalid token', shouldDelete: true };
    }

    return { success: false, error: error.message };
  }
};

/**
 * Send push notification to multiple users
 * @param {Array} tokens - Array of FCM tokens
 * @param {object} notification - Notification data
 */
export const sendMulticastPushNotification = async (tokens, notification) => {
  if (!tokens || tokens.length === 0) {
    console.log('❌ No FCM tokens provided');
    return { success: false, error: 'No FCM tokens' };
  }

  try {
    const message = {
      tokens: tokens,
      notification: {
        title: notification.title || 'Acehive',
        body: notification.message,
        // ✅ Removed icon from here
      },
      data: {
        type: notification.type || 'general',
        subject: notification.subject || '',
        url: notification.url || '/',
      },
      webpush: {
        fcm_options: {
          link: notification.url || '/',
        },
        notification: {
          icon: '/android-icon-192x192.png',
          badge: '/android-icon-96x96.png',
        },
      },
    };

    const response = await messaging.sendEachForMulticast(message);
    console.log(`✅ Sent ${response.successCount} notifications, ${response.failureCount} failed`);

    return {
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
      responses: response.responses,
    };
  } catch (error) {
    console.error('❌ Error sending multicast push notification:', error);
    return { success: false, error: error.message };
  }
};

export default admin;