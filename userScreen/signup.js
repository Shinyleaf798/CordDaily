import React, { useState } from "react";
import { SafeAreaView, View, Text, TextInput, TouchableOpacity, StyleSheet, Image, Alert } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { PageHeader } from "../global_function/page_header";
import { apiFetch } from '../global_function/convertAPI';

const CODES = ["USD","CNY","MYR","GBP"];
const FLAG_SRC = {
  USD: require("../assets/flags/flag_USD.png"),
  CNY: require("../assets/flags/flag_CNY.png"),
  MYR: require("../assets/flags/flag_MYR.png"),
  GBP: require("../assets/flags/flag_GBP.png"),
};

export default function SignupScreen() {
  const navigation = useNavigation();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [currency, setCurrency] = useState("MYR");
  const [showPicker, setShowPicker] = useState(false);
  const emailGood = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const passwordGood = password.length >= 8;
  const nameGood = username.trim().length >= 2;
  const formDone = emailGood && passwordGood && nameGood;

  const handleSignup = async () => {
    const trimmedEmail = email.trim();
    const trimmedName  = username.trim();
    if (!nameGood) {
      Alert.alert("Invalid username", "Username must be at least 2 characters.");
      return;
    }
    if (!emailGood) {
      Alert.alert("Invalid email", "Please enter a valid email address.");
      return;
    }
    if (!passwordGood) {
      Alert.alert("Weak password", "Password must be at least 8 characters.");
      return;
    }
    try {
      await apiFetch('/register.php', {
        method: 'POST',
        body: JSON.stringify({ username: trimmedName, email: trimmedEmail, password, currency })
      });
      Alert.alert('Success', 'Registration Successful');
      navigation.navigate('Login');
    } catch (err) {
      Alert.alert('Register Failed', err.message || 'Something went wrong');
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <PageHeader title="Signup" target="Login"/>

      <Image
        source={require("../assets/app_logo.png")}
        style={styles.avatar}
      />
      <Text style={styles.appName}>CordDaily</Text>

      <View style={styles.form}>
        <Text style={[styles.label,{marginTop:14}]}>Username</Text>
        <TextInput
          placeholder="Enter username"
          placeholderTextColor="#777"
          value={username}
          onChangeText={setUsername}
          style={styles.input}
          autoCapitalize="none"
          maxLength={10}
        />
        {username !== "" && !nameGood && (
          <Text style={styles.err}>Min 2 characters.</Text>
        )}
        <Text style={[styles.label,{marginTop:14}]}>Account</Text>
        <TextInput
          placeholder="Enter email"
          placeholderTextColor="#777"
          value={email}
          onChangeText={setEmail}
          style={styles.input}
          autoCapitalize="none"
        />
        {email !== "" && !emailGood && (
          <Text style={styles.err}>Enter a valid email (e.g., name@example.com).</Text>
        )}

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
        {password !== "" && !passwordGood && (
          <Text style={styles.err}>At least 8 characters.</Text>
        )}

        <Text style={[styles.label,{marginTop:14}]}>Default Currency</Text>
          <TouchableOpacity
            style={[styles.input, styles.inputSelect]}
            onPress={() => setShowPicker(true)}
            activeOpacity={0.8}
          >
            <Image source={FLAG_SRC[currency]} style={styles.flag} />
            <Text style={styles.inputSelectText}>{currency}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.primaryBtn, !formDone && { opacity: 0.5 }]}
            onPress={handleSignup}
            disabled={!formDone}
          >
            <Text style={styles.primaryText}>Register</Text>
          </TouchableOpacity>
      </View>

      {/* Centered Currency Picker (no Modal) */}
      {showPicker && (
        <>
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setShowPicker(false)} />
          <View style={styles.centerWrap}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Select Default Currency</Text>

              {CODES.map(code => (
                <TouchableOpacity
                  key={code}
                  style={[styles.row, currency===code && styles.rowActive]}
                  onPress={() => setCurrency(code)}
                  activeOpacity={0.8}
                >
                  <Image source={FLAG_SRC[code]} style={styles.flag} />
                  <Text style={styles.rowText}>{code}</Text>
                </TouchableOpacity>
              ))}

              <TouchableOpacity style={styles.doneBtn} onPress={() => setShowPicker(false)}>
                <Text style={styles.doneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen:{
    flex:1, 
    backgroundColor:"#070707"
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
  err: { 
    color: "#ef4444", 
    fontSize: 12, 
    marginTop: 6, 
    marginLeft: 4 
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
    height:44, 
    justifyContent:"center"
  },
  inputSelect: {
    flexDirection: "row",    
    alignItems: "center",  
    justifyContent: "flex-start",
  },
  flag: {
    width: 24,
    height: 16,         
    borderRadius: 3,
    marginRight: 10,
    borderWidth: 0.5,
    borderColor: "#333",
  },
  inputSelectText: {
    color: "#fff",
    fontSize: 16,
  },
  
  primaryBtn:{
    marginTop:18, 
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

  backdrop:{
    position:"absolute",
    top:0, 
    left:0, 
    right:0, 
    bottom:0, 
    backgroundColor:"rgba(0,0,0,0.6)"
  },
  centerWrap:{
    position:"absolute", 
    top:0, 
    left:0, 
    right:0, 
    bottom:0, 
    alignItems:"center", 
    justifyContent:"center"
  },
  card:{
    width:"82%", 
    backgroundColor:"#111111", 
    borderRadius:16, 
    padding:16
  },
  cardTitle:{
    color:"#eee", 
    fontSize:16, 
    fontWeight:"700", 
    marginBottom:10
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1b1b1b",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },

  rowActive:{
    borderWidth:1,
    borderColor:"#3b82f6"
  },
  rowText:{
    color:"#fff", 
    fontSize:16
  },
  doneBtn:{
    marginTop:8, 
    backgroundColor:"#3b82f6", 
    height:42, 
    borderRadius:10, 
    alignItems:"center", 
    justifyContent:"center"
  },
  doneText:{
    color:"#fff", 
    fontWeight:"700"
  },
});
