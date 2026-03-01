import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Localization from "expo-localization";
import type { Session } from "@supabase/supabase-js";
import { dateToTimeString, timeStringToDate } from "../lib/date";
import { loadPushPrefs, savePushPrefs } from "../lib/push-prefs";
import { supabase } from "../lib/supabase";
import { appStyles } from "../styles";

type SettingsScreenProps = {
  session: Session | null;
  isSessionLoading: boolean;
};

function getDeviceTimezone(): string {
  const fromLocalization = Localization.getCalendars()[0]?.timeZone;
  if (fromLocalization && fromLocalization.trim().length > 0) {
    return fromLocalization;
  }

  const fromIntl = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return fromIntl && fromIntl.trim().length > 0 ? fromIntl : "UTC";
}

export function SettingsScreen({ session, isSessionLoading }: SettingsScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const defaultTimezone = useMemo(() => getDeviceTimezone(), []);
  const [notifyEnabled, setNotifyEnabled] = useState(true);
  const [notifyTime, setNotifyTime] = useState("08:00");
  const [timezone, setTimezone] = useState(defaultTimezone);
  const [showPicker, setShowPicker] = useState(false);
  const [prefsLoading, setPrefsLoading] = useState(false);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsMessage, setPrefsMessage] = useState<string | null>(null);
  const [prefsError, setPrefsError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const loadPrefs = useCallback(async () => {
    if (!session?.user.id) {
      return;
    }

    setPrefsLoading(true);
    setPrefsError(null);
    setPrefsMessage(null);

    try {
      const prefs = await loadPushPrefs(session.user.id);
      if (!prefs) {
        setNotifyEnabled(true);
        setNotifyTime("08:00");
        setTimezone(defaultTimezone);
        setLastSavedAt(null);
      } else {
        setNotifyEnabled(prefs.notificationsEnabled);
        setNotifyTime(prefs.notifyTimeLocal);
        setTimezone(prefs.timezone || defaultTimezone);
        setLastSavedAt(prefs.updatedAt);
      }
    } catch (error) {
      setPrefsError(
        error instanceof Error ? error.message : "Unable to load notification settings.",
      );
    } finally {
      setPrefsLoading(false);
    }
  }, [defaultTimezone, session?.user.id]);

  useEffect(() => {
    if (!session) {
      setPrefsError(null);
      setPrefsMessage(null);
      return;
    }
    void loadPrefs();
  }, [loadPrefs, session]);

  async function signIn() {
    if (!email.trim() || !password) {
      setAuthError("Email and password are required.");
      return;
    }

    setAuthBusy(true);
    setAuthError(null);
    setAuthMessage(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setAuthBusy(false);

    if (error) {
      setAuthError(error.message);
      return;
    }

    setAuthMessage("Signed in.");
  }

  async function signUp() {
    if (!email.trim() || !password) {
      setAuthError("Email and password are required.");
      return;
    }

    setAuthBusy(true);
    setAuthError(null);
    setAuthMessage(null);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    setAuthBusy(false);

    if (error) {
      setAuthError(error.message);
      return;
    }

    setAuthMessage("Account created. Check email verification if required.");
  }

  async function signOut() {
    setAuthBusy(true);
    setAuthError(null);
    setAuthMessage(null);
    const { error } = await supabase.auth.signOut();
    setAuthBusy(false);
    if (error) {
      setAuthError(error.message);
      return;
    }

    setAuthMessage("Signed out.");
  }

  async function savePrefs() {
    if (!session?.user.id) {
      return;
    }

    setPrefsSaving(true);
    setPrefsError(null);
    setPrefsMessage(null);
    try {
      const saved = await savePushPrefs({
        userId: session.user.id,
        notificationsEnabled: notifyEnabled,
        notifyTimeLocal: notifyTime,
        timezone,
      });
      setNotifyEnabled(saved.notificationsEnabled);
      setNotifyTime(saved.notifyTimeLocal);
      setTimezone(saved.timezone);
      setLastSavedAt(saved.updatedAt);
      setPrefsMessage("Notification settings saved.");
    } catch (error) {
      setPrefsError(error instanceof Error ? error.message : "Unable to save notification settings.");
    } finally {
      setPrefsSaving(false);
    }
  }

  const timeValue = useMemo(() => timeStringToDate(notifyTime), [notifyTime]);

  return (
    <ScrollView style={appStyles.screen} contentContainerStyle={appStyles.content}>
      <Text style={appStyles.sectionTitle}>Settings</Text>

      {isSessionLoading ? <ActivityIndicator size="small" color="#1d4ed8" /> : null}

      {!session ? (
        <View style={appStyles.stack}>
          <View style={appStyles.card}>
            <Text style={appStyles.label}>Email</Text>
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              style={appStyles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor="#94a3b8"
            />

            <Text style={appStyles.label}>Password</Text>
            <TextInput
              secureTextEntry
              autoCapitalize="none"
              style={appStyles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor="#94a3b8"
            />

            <Pressable style={appStyles.button} disabled={authBusy} onPress={() => void signIn()}>
              <Text style={appStyles.buttonText}>{authBusy ? "Working..." : "Sign In"}</Text>
            </Pressable>
            <Pressable
              style={[appStyles.button, appStyles.buttonMuted]}
              disabled={authBusy}
              onPress={() => void signUp()}
            >
              <Text style={[appStyles.buttonText, appStyles.buttonMutedText]}>
                {authBusy ? "Working..." : "Create Account"}
              </Text>
            </Pressable>
          </View>
          {authError ? <Text style={appStyles.errorText}>{authError}</Text> : null}
          {authMessage ? <Text style={appStyles.mutedText}>{authMessage}</Text> : null}
        </View>
      ) : (
        <View style={appStyles.stack}>
          <View style={appStyles.card}>
            <Text style={appStyles.label}>Signed in as</Text>
            <Text style={appStyles.mutedText}>{session.user.email ?? "Unknown email"}</Text>
            <Pressable
              style={[appStyles.button, appStyles.buttonMuted]}
              disabled={authBusy}
              onPress={() => void signOut()}
            >
              <Text style={[appStyles.buttonText, appStyles.buttonMutedText]}>
                {authBusy ? "Signing out..." : "Sign Out"}
              </Text>
            </Pressable>
          </View>

          <View style={appStyles.card}>
            <Text style={appStyles.label}>Daily brief notifications</Text>
            {prefsLoading ? <ActivityIndicator size="small" color="#1d4ed8" /> : null}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={appStyles.mutedText}>Enabled</Text>
              <Switch value={notifyEnabled} onValueChange={setNotifyEnabled} />
            </View>

            <Text style={appStyles.label}>Preferred delivery time</Text>
            <Pressable
              style={[appStyles.button, appStyles.buttonMuted]}
              onPress={() => setShowPicker(true)}
            >
              <Text style={[appStyles.buttonText, appStyles.buttonMutedText]}>{notifyTime}</Text>
            </Pressable>

            <Text style={appStyles.label}>Timezone</Text>
            <TextInput
              style={appStyles.input}
              value={timezone}
              onChangeText={setTimezone}
              autoCapitalize="none"
              placeholder="America/New_York"
              placeholderTextColor="#94a3b8"
            />

            <Pressable style={appStyles.button} disabled={prefsSaving} onPress={() => void savePrefs()}>
              <Text style={appStyles.buttonText}>{prefsSaving ? "Saving..." : "Save Notification Settings"}</Text>
            </Pressable>
            {lastSavedAt ? (
              <Text style={appStyles.mutedText}>
                Last saved: {new Date(lastSavedAt).toLocaleString()}
              </Text>
            ) : null}
          </View>

          {prefsError ? <Text style={appStyles.errorText}>{prefsError}</Text> : null}
          {prefsMessage ? <Text style={appStyles.mutedText}>{prefsMessage}</Text> : null}
        </View>
      )}

      {showPicker ? (
        <DateTimePicker
          mode="time"
          value={timeValue}
          onChange={(event, selectedValue) => {
            if (Platform.OS === "android") {
              setShowPicker(false);
            }
            if (event.type === "dismissed") {
              return;
            }
            if (selectedValue) {
              setNotifyTime(dateToTimeString(selectedValue));
            }
          }}
        />
      ) : null}
    </ScrollView>
  );
}
