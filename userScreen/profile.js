import React, { useState, useEffect } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { PageHeader } from "../global_function/page_header";
import { getUser, saveUser } from "../global_function/localStorage";
import { apiFetch } from '../global_function/convertAPI';

export default function ProfileScreen() {
  const navigation = useNavigation();
  const [username, setUsername] = useState("");
  const [account, setAccount] = useState("");

  // load saved profile from localStorage
  useEffect(() => {
    (async () => {
      const user = await getUser();
      if (user) {
        setUsername(user.username || "");
        setAccount(user.email || "");
      }
    })();
  }, []);

  const onConfirm = async () => {
    try {
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.trim());
  
      if (!emailOk) {
        Alert.alert("Invalid email", "Please enter a valid email address.");
        return;
      }
      const user = await getUser();   // to know user id from storage
      const payload = {
        userID: user?.id,
        username: username,
        email: account,
      };

      const res = await apiFetch("/updateProfile.php", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (res?.ok !== false) {
        await saveUser({ ...user, username: username, email: account });
        navigation.navigate("User");
      } else {
        Alert.alert("Error", res.error || "Update failed on server");
      }
    } catch (err) {
      console.error("Profile update failed:", err);
      Alert.alert("Error", String(err));
    }
  };

  const disabled = username.trim().length === 0 || account.trim().length === 0;

  return (
    <SafeAreaView style={styles.screen}>
      <PageHeader title="Edit Profile" target="User" />

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionText}>Account information</Text>
        </View>

        {/* Username */}
        <View style={styles.row}>
          <Text style={styles.rowLeft}>Username</Text>
          <TextInput
            style={styles.rowInput}
            placeholder="Enter username"
            placeholderTextColor="#9ca3af"
            value={username}
            onChangeText={setUsername}
            maxLength={10}
            textAlign="right"
          />
        </View>

        {/* Email */}
        <View style={styles.row}>
          <Text style={styles.rowLeft}>Account</Text>
          <TextInput
            style={styles.rowInput}
            placeholder="Enter email"
            placeholderTextColor="#9ca3af"
            value={account}
            onChangeText={setAccount}
            keyboardType="email-address"
            autoCapitalize="none"
            textAlign="right"
          />
        </View>

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={onConfirm}
          disabled={disabled}
          style={[styles.confirmBtn, disabled && { opacity: 0.5 }]}
        >
          <Text style={styles.confirmText}>Confirm</Text>
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
    marginTop: 10,
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
    borderBottomColor: "#222",
  },
  rowLeft: { 
    color: "#e5e7eb", 
    fontSize: 15 
  },
  rowInput: {
    flex: 1,
    marginLeft: 10,
    color: "#fff",
    paddingVertical: 0,
  },

  confirmBtn: {
    backgroundColor: "#60a5fa",
    marginHorizontal: 20,
    marginTop: 24,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    height: 48,
  },
  confirmText: { 
    color: "#fff", 
    fontSize: 18, 
    fontWeight: "700" 
  },
});
