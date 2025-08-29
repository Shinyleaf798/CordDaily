import React, { useEffect, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Switch,
  ScrollView,
  Alert,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { BottomMenu } from "../global_function/menuButton";
import { clearAll } from "../global_function/localStorage";
import { getUser } from "../global_function/localStorage";

// import helpers
import {
  isReminderEnabled,
  scheduleDailyReminder,
  cancelDailyReminder,
} from "../global_function/noticeReminder";

export default function UserScreen() {
  const navigation = useNavigation();
  const [username, setUsername] = useState("");
  const [reminder, setReminder] = useState(true);
  const [booted, setBooted] = useState(false);

  // Load persisted state once
  useEffect(() => {
    (async () => {
      try {
        const user = await getUser();
          if (user) {
            setUsername(user.username || "");
          }

        const enabled = await isReminderEnabled();
        setReminder(enabled);
      } catch {
        setReminder(false);
      } finally {
        setBooted(true);
      }
    })();
  }, []);

  // Toggle logic
  const toggleReminder = async () => {
    try {
      if (!reminder) {
        // turning ON -> schedule for 9:00 PM
        await scheduleDailyReminder(21, 0);
        setReminder(true);
        Alert.alert("Notice", "Daily reminder set for 9:00 PM.");
      } else {
        // turning OFF -> cancel
        await cancelDailyReminder();
        setReminder(false);
        Alert.alert("Notice", "Daily reminder turned off.");
      }
    } catch (e) {
      Alert.alert("Permission needed", "Please allow notifications in settings.");
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Header */}
        <View style={styles.profileCard}>
          <View style={styles.avatarWrap}>
            <Image
              source={require("../assets/user_default.png")}
              style={styles.avatar}
            />
          </View>
          <Text style={styles.userName}>{username}</Text>
        </View>

        {/* Rows */}
        <View style={styles.list}>
          <SettingRow
            image={require("../assets/profile.png")}
            title="Profile"
            right={<Text style={styles.chev}>›</Text>}
            onPress={() => navigation.navigate("Profile")}
          />

          <SettingRow
            image={require("../assets/reset-password.png")}
            title="Reset Password"
            right={<Text style={styles.chev}>›</Text>}
            onPress={() => navigation.navigate("ResetPass")}
          />

          <SettingRow
            image={require("../assets/reminder.png")}
            title="Notice Reminder (9:00 PM)"
            right={
              <Switch
                value={booted ? reminder : false}
                onValueChange={toggleReminder}
                thumbColor={reminder ? "#60a5fa" : "#e5e7eb"}
                trackColor={{ true: "#1e3a8a", false: "#4b5563" }}
              />
            }
            //onPress={toggleReminder}
          />

          <SettingRow
            image={require("../assets/about_us.png")}
            title="About"
            right={<Text style={styles.chev}>›</Text>}
            onPress={() => {
              navigation.navigate("About");
            }}
          />

          <SettingRow
            image={require("../assets/log_out.png")}
            title="Log Out"
            right={<Text style={styles.chev}>›</Text>}
            onPress={async () => {
              await cancelDailyReminder();
              await clearAll();
              navigation.reset({
                index: 0,
                routes: [{ name: "Login" }],
              });
            }}
          />
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
      <BottomMenu />
    </SafeAreaView>
  );
}

function SettingRow({ image, title, right, onPress }) {
  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.8} onPress={onPress}>
      <Image source={image} style={styles.rowImg} />
      <Text style={styles.rowText}>{title}</Text>
      <View style={{ flex: 1 }} />
      {right}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { 
    flex: 1, 
    backgroundColor: "#070707ff" 
  },

  profileCard: {
    backgroundColor: "#151515",
    paddingTop: 40,
    marginBottom: 20,
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  avatarWrap: {
    width: 80,
    height: 80,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginRight: 12,
  },
  avatar: { 
    width: "100%", 
    height: "100%", 
    resizeMode: "cover" 
  },
  userName: { 
    color: "#fff", 
    fontSize: 22, 
    fontWeight: "700" 
  },

  list: {
    backgroundColor: "#151515",
    marginHorizontal: 12,
    borderRadius: 12,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#151515",
    borderBottomWidth: 1,
    borderBottomColor: "#222",
  },
  rowImg: {
    width: 30,
    height: 30,
    marginRight: 10,
    resizeMode: "contain",
  },
  rowText: { 
    color: "#e5e7eb", 
    fontSize: 16 
  },
  chev: { 
    color: "#fff",
    fontSize: 22, 
    marginLeft: 8 
  },
});
