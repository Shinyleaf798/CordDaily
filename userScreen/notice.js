import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, Alert, Image, TouchableOpacity } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { BottomMenu } from "../global_function/menuButton";
import {
  isReminderEnabled,
  cancelDailyReminder,
} from "../global_function/noticeReminder";

export default function NoticeScreen() {
  const [booted, setBooted] = useState(false);
  const [enabled, setEnabled] = useState(false);

  // Refresh every time the screen gains focus so it reflects the switch in User page
  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      (async () => {
        try {
          const on = await isReminderEnabled();
          if (mounted) setEnabled(on);
        } finally {
          if (mounted) setBooted(true);
        }
      })();
      return () => { mounted = false; };
    }, [])
  );

  const onDelete = async () => {
    try {
      await cancelDailyReminder();
      setEnabled(false);
      Alert.alert("Notice", "Daily reminder turned off.");
    } catch (e) {
      Alert.alert("Error", "Could not cancel the reminder.");
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notice</Text>
        {/* Spacer so title stays centered */}
        <View style={{ width: 30 }} />
      </View>

      {!booted ? null : enabled ? (
        <View style={styles.card}>
          <View style={styles.leftIcon}>
            <Image
              source={require("../assets/notification.png")} 
              style={styles.iconImg}
              resizeMode="contain"
            />
          </View>

          <View style={styles.cardTextWrap}>
            <Text numberOfLines={2} style={styles.cardText}>
              Have you kept track of your accounts today?
            </Text>
          </View>

          <TouchableOpacity onPress={onDelete} style={styles.deleteBtn} activeOpacity={0.7}>
            <Image
              source={require("../assets/delete.png")}
              style={styles.iconImg}
              resizeMode="contain"
            />
          </TouchableOpacity>
        </View>
      ) : (
        <Text style={styles.hint}>
          Reminder is off. Turn it on in Account → Notice Reminder.
        </Text>
      )}
      <BottomMenu />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#000",
    paddingTop: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111111ff",
    paddingTop: 30,
    paddingBottom: 10,
    paddingHorizontal: 12,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    flex: 1,
    textAlign: "center",
  },
  card: {
    backgroundColor: "#0f0f0f",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginHorizontal: 20,
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  leftIcon: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  cardTextWrap: { 
    flex: 1,
  },
  cardText: {
    color: "#e5e7eb",
    fontSize: 14,
  },
  deleteBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  hint: {
    color: "#6b7280",
    fontSize: 13,
    textAlign: "center",
    marginTop: 12,
  },
  iconImg: {
    width: 22,
    height: 22,
  },
});
