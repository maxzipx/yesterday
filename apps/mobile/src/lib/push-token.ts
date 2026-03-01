import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

type RegisterPushResult =
  | { ok: true; expoPushToken: string }
  | { ok: false; error: string };

function getProjectId(): string | undefined {
  const fromEnv = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  const fromConstants =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  return fromConstants?.trim() || undefined;
}

export async function registerForPushTokenAsync(): Promise<RegisterPushResult> {
  if (!Device.isDevice) {
    return { ok: false, error: "Push notifications require a physical device." };
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let finalStatus = existing.status;
  if (finalStatus !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }

  if (finalStatus !== "granted") {
    return { ok: false, error: "Push notification permission was not granted." };
  }

  try {
    const projectId = getProjectId();
    const token = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();

    if (!token.data?.trim()) {
      return { ok: false, error: "Failed to retrieve Expo push token." };
    }

    return { ok: true, expoPushToken: token.data.trim() };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to register push notifications.",
    };
  }
}
