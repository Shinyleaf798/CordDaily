import React, { useState } from "react";
import { SafeAreaView, View, Text, TextInput, TouchableOpacity, StyleSheet, Image, Alert } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { apiFetch, ensureRatesUpToDate } from '../global_function/convertAPI';
import { saveToken, saveUser } from '../global_function/localStorage';
import { useBills } from "../global_function/billsContent";

export default function LoginScreen() {
  const navigation = useNavigation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { syncFromServer } = useBills();

  const handleLogin = async () => {
    try {
      const data = await apiFetch('/login.php', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password }),
        debug: true, 
      });

      // handle backend failure
      if (!data || data.success === false) {
        Alert.alert('Login Failed', data?.message || data?.error || 'Invalid password');
        return;
      }

      // sanity checks
      if (!data.user || !data.token) {
        Alert.alert('Login Failed', 'Malformed server response.');
        return;
      }

      await saveToken(data.token);
      await saveUser(data.user);

      // safe access with optional chaining + fallback
      const base = data.user?.defaultCurrency ?? 'USD';
      await ensureRatesUpToDate(base);

      await syncFromServer();

      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    } catch (err) {
      Alert.alert('Login Failed', String(err?.message || err));
    }
  };

  

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Login</Text>
        {/* Spacer so title stays centered */}
        <View style={{ width: 30 }} />
      </View>

      <Image
        source={require("../assets/app_logo.png")}
        style={styles.avatar}
      />
      <Text style={styles.appName}>CordDaily</Text>

      <View style={styles.form}>
        <Text style={styles.label}>Account</Text>
        <TextInput
          placeholder="Enter email"
          placeholderTextColor="#777"
          value={email}
          onChangeText={setEmail}
          style={styles.input}
          autoCapitalize="none"
        />

        <Text style={[styles.label,{marginTop:14}]}>Password</Text>
        <TextInput
          placeholder="Enter password"
          placeholderTextColor="#777"
          value={password}
          onChangeText={setPassword}
          style={styles.input}
          secureTextEntry
          maxLength={20}
        />

        <TouchableOpacity style={styles.primaryBtn} onPress={handleLogin}>
          <Text style={styles.primaryText}>Login</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkBtn} onPress={() => navigation.navigate("Signup")}>
          <Text style={styles.linkText}>No account? Register</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen:{
    flex:1, 
    backgroundColor:"#070707"
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
  avatar:{
    width:96, 
    height:96, 
    borderRadius:48, 
    alignSelf:"center", 
    marginTop:24
  },
  appName:{
    color:"#ddd",
    fontSize: 20,
    textAlign: "center", 
  },
  form:{
    paddingHorizontal:24, 
    marginTop:16
  },
  label:{
    color:"#ddd", 
    marginBottom:8
  },
  input:{
    backgroundColor:"#1b1b1b", 
    color:"#fff", 
    borderRadius:12, 
    paddingHorizontal:12, 
    height:44
  },
  primaryBtn:{
    marginTop:50, 
    backgroundColor:"#2a2a2a", 
    height:44, 
    borderRadius:12, 
    alignItems:"center", 
    justifyContent:"center"
  },
  primaryText:{
    color:"#fff", 
    fontWeight:"700"
  },
  linkBtn:{
    marginTop:12, 
    alignItems:"center"
  },
  linkText:{
    color:"#9ca3af"
  },
});