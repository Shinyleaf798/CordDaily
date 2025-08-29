import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Keys to persist state
const K_ENABLED = "@reminder_enabled";
const K_TASK_ID = "@reminder_task_id";

// Foreground behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function ensureAndroidChannel() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("daily-reminders", {
      name: "Daily Reminders",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      bypassDnd: false,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }
}

export async function requestPermissionsIfNeeded() {
  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return true;
  }
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted || asked.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

export async function scheduleDailyReminder(hour = 21, minute = 0) {
  await ensureAndroidChannel();
  const ok = await requestPermissionsIfNeeded();
  if (!ok) throw new Error("Permission denied");

  // Expo supports repeating triggers by time components
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: "Daily Cost Reminder",
      body: "Forgot to record today’s daily cost?",
      sound: null,
    },
    trigger: {
      hour,
      minute,
      repeats: true,
      channelId: Platform.OS === "android" ? "daily-reminders" : undefined,
    },
  });

  await AsyncStorage.setItem(K_TASK_ID, id);
  await AsyncStorage.setItem(K_ENABLED, "1");
  return id;
}

export async function cancelDailyReminder() {
  const id = await AsyncStorage.getItem(K_TASK_ID);
  if (id) {
    try { await Notifications.cancelScheduledNotificationAsync(id); } catch {}
  }
  await AsyncStorage.setItem(K_ENABLED, "0");
  await AsyncStorage.removeItem(K_TASK_ID);
}

export async function isReminderEnabled() {
  const v = await AsyncStorage.getItem(K_ENABLED);
  return v === "1";
}
