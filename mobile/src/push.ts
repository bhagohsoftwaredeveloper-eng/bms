import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { api } from './api';

let registeredToken: string | null = null;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Ask for permission, obtain the device push token, and register it with the
 * backend (`POST /notifications/device-token`). Safe to call repeatedly.
 *
 * NOTE: the backend sends through Firebase Cloud Messaging. For a production
 * build you must add your `google-services.json` / FCM config and use a dev
 * build (not Expo Go) so the native FCM token resolves. Until then this still
 * runs harmlessly — the token simply won't receive pushes.
 */
export async function registerForPush(): Promise<void> {
  try {
    if (!Device.isDevice) return;

    // Expo Go (SDK 53+) removed remote push. Skip entirely to avoid console
    // errors — real push only works in a development/standalone build.
    if (Constants.appOwnership === 'expo') return;

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    // Native device token (FCM on Android / APNs on iOS).
    const tokenResponse = await Notifications.getDevicePushTokenAsync();
    const token = String(tokenResponse.data);
    if (!token || token === registeredToken) return;

    await api.post('/notifications/device-token', {
      token,
      platform: Platform.OS,
    });
    registeredToken = token;
  } catch {
    // Non-fatal: push is a nice-to-have, never block the app.
  }
}

export async function unregisterPush(): Promise<void> {
  try {
    if (registeredToken) {
      await api.delete(`/notifications/device-token/${encodeURIComponent(registeredToken)}`);
      registeredToken = null;
    }
  } catch {
    // ignore
  }
}

export const _config = Constants.expoConfig;
