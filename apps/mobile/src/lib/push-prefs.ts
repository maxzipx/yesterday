import { supabase } from "./supabase";

export type UserPushPrefs = {
  userId: string;
  notificationsEnabled: boolean;
  notifyTimeLocal: string;
  timezone: string;
  expoPushToken: string | null;
  updatedAt: string;
};

function normalizeTimeInput(value: string): string | null {
  const trimmed = value.trim();
  if (!/^\d{2}:\d{2}$/.test(trimmed)) {
    return null;
  }

  const [hours, minutes] = trimmed.split(":").map((part) => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export async function loadPushPrefs(userId: string): Promise<UserPushPrefs | null> {
  const { data, error } = await supabase
    .from("user_push_prefs")
    .select(
      "user_id, notifications_enabled, notify_time_local, timezone, expo_push_token, updated_at",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load notification settings: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    userId: data.user_id,
    notificationsEnabled: data.notifications_enabled,
    notifyTimeLocal: String(data.notify_time_local).slice(0, 5),
    timezone: data.timezone,
    expoPushToken: data.expo_push_token,
    updatedAt: data.updated_at,
  };
}

export async function savePushPrefs(input: {
  userId: string;
  notificationsEnabled: boolean;
  notifyTimeLocal: string;
  timezone: string;
  expoPushToken?: string | null;
}): Promise<UserPushPrefs> {
  const normalizedTime = normalizeTimeInput(input.notifyTimeLocal);
  if (!normalizedTime) {
    throw new Error("Notification time must be in HH:mm format.");
  }

  const { data, error } = await supabase
    .from("user_push_prefs")
    .upsert(
      {
        user_id: input.userId,
        notifications_enabled: input.notificationsEnabled,
        notify_time_local: normalizedTime,
        timezone: input.timezone,
        expo_push_token: input.expoPushToken ?? null,
      },
      { onConflict: "user_id" },
    )
    .select(
      "user_id, notifications_enabled, notify_time_local, timezone, expo_push_token, updated_at",
    )
    .single();

  if (error || !data) {
    throw new Error(`Failed to save notification settings: ${error?.message ?? "unknown error"}`);
  }

  return {
    userId: data.user_id,
    notificationsEnabled: data.notifications_enabled,
    notifyTimeLocal: String(data.notify_time_local).slice(0, 5),
    timezone: data.timezone,
    expoPushToken: data.expo_push_token,
    updatedAt: data.updated_at,
  };
}
