// src/config/firebaseAdmin.js
import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load service account from file
const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, '../../firebase-service-account.json'), 'utf8')
);

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

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