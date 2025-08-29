import React, { useState } from "react";
import {
  SafeAreaView, View, Text, StyleSheet, TouchableOpacity,
  TextInput, ScrollView, Alert
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { PageHeader } from "../global_function/page_header";
import { apiFetch } from "../global_function/convertAPI";
import { getUser } from "../global_function/localStorage";

export default function ResetPassScreen() {
  const navigation = useNavigation();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNew, setConfirmNew]   = useState("");
  const [saving, setSaving] = useState(false);

  // validation
  const passwordGood       = newPassword.length >= 8;
  const matchPassGood    = newPassword === confirmNew;
  const diffFromOld= newPassword !== "" && newPassword !== oldPassword;
  const allFilled  = oldPassword.trim() && newPassword.trim() && confirmNew.trim();
  const formDone     = !!(allFilled && passwordGood && matchPassGood && diffFromOld);

  const onConfirm = async () => {
    if (!formDone) {
      if (!passwordGood)       return Alert.alert("Weak password", "New password must be at least 8 characters.");
      if (!matchPassGood)    return Alert.alert("Mismatch", "New password and confirmation must match.");
      if (!diffFromOld)return Alert.alert("Invalid", "New password must be different from the old password.");
      return;
    }

    try {
      setSaving(true);
      const user = await getUser();
      if (!user?.id) {
        Alert.alert("Not logged in", "Please log in again.");
        return;
      }

      const res = await apiFetch("/updatePassword.php", {
        method: "POST",
        body: JSON.stringify({
          userID: user.id,
          oldPassword,
          newPassword,
        }),
      });

      // accept either {success:true} or {ok:true}
      if (res?.success === false || res?.ok === false) {
        return Alert.alert("Error", res?.error || "Password update failed.");
      }

      Alert.alert("Success", "Password updated.");
      navigation.navigate("User");
    } catch (err) {
      Alert.alert("Error", String(err?.message || err));
    } finally {
      setSaving(false);
    }
  };

  const disabled = !formDone || saving;

  return (
    <SafeAreaView style={styles.screen}>
      <PageHeader title="Edit Password" target="User" />

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionText}>Account information</Text>
        </View>

        {/* Old password */}
        <View style={styles.row}>
          <Text style={styles.rowLeft}>Old Password</Text>
          <TextInput
            style={styles.rowInput}
            placeholder="Enter old password"
            placeholderTextColor="#9ca3af"
            value={oldPassword}
            onChangeText={setOldPassword}
            secureTextEntry
            textContentType="password"
            autoCapitalize="none"
            maxLength={20}
            textAlign="right"
          />
        </View>

        {/* New password */}
        <View style={styles.row}>
          <Text style={styles.rowLeft}>New Password</Text>
          <TextInput
            style={styles.rowInput}
            placeholder="Enter new password (min 8)"
            placeholderTextColor="#9ca3af"
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            textContentType="newPassword"
            autoCapitalize="none"
            maxLength={20}
            textAlign="right"
          />
        </View>
        {newPassword !== "" && !passwordGood && (
          <Text style={styles.err}>At least 8 characters.</Text>
        )}

        {/* Confirm */}
        <View style={styles.row}>
          <Text style={styles.rowLeft}>Confirm New Password</Text>
          <TextInput
            style={styles.rowInput}
            placeholder="Enter again password"
            placeholderTextColor="#9ca3af"
            value={confirmNew}
            onChangeText={setConfirmNew}
            secureTextEntry
            textContentType="newPassword"
            autoCapitalize="none"
            maxLength={20}
            textAlign="right"
          />
        </View>
        {confirmNew !== "" && !matchPassGood && (
          <Text style={styles.err}>Passwords do not match.</Text>
        )}
        {newPassword !== "" && oldPassword !== "" && !diffFromOld && (
          <Text style={styles.err}>New password must be different from old.</Text>
        )}

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={onConfirm}
          disabled={disabled}
          style={[styles.confirmBtn, disabled && { opacity: 0.5 }]}
        >
          <Text style={styles.confirmText}>{saving ? "Saving..." : "Confirm"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { 
    flex: 1, 
    backgroundColor: "#070707ff" 
  },
  sectionHeader: { 
    backgroundColor: "#0b0b0b", 
    paddingHorizontal: 12, 
    paddingVertical: 8, 
    marginTop: 10 
  },
  sectionText: { 
    color: "#d1d5db", 
    fontWeight: "700", 
    fontSize: 12 
  },
  row: { 
    flexDirection: "row", 
    alignItems: "center", 
    backgroundColor: "#121212", 
    paddingHorizontal: 14, 
    paddingVertical: 14, 
    borderBottomWidth: 1, 
    borderBottomColor: "#222" 
  },
  rowLeft: { 
    color: "#e5e7eb", 
    fontSize: 15 
  },
  rowInput: { 
    flex: 1, 
    marginLeft: 10, 
    color: "#fff", 
    paddingVertical: 0 
  },
  err: { 
    color: "#ef4444", 
    fontSize: 12, 
    marginTop: 6, 
    marginLeft: 16 
  },
  confirmBtn: { 
    backgroundColor: "#60a5fa", 
    marginHorizontal: 20, 
    marginTop: 24, 
    borderRadius: 10, 
    alignItems: "center", 
    justifyContent: "center", 
    height: 48 
  },
  confirmText: { 
    color: "#fff", 
    fontSize: 18, 
    fontWeight: "700" 
  },
});
