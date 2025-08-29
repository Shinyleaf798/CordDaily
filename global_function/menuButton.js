import React from "react";
import { TouchableOpacity, Image, Text, StyleSheet, View, Platform } from "react-native";
import { useNavigation } from "@react-navigation/native";

// 👇 Centralized icon map
const icons = {
  Home: require("../assets/home.png"),
  Overview: require("../assets/chart.png"),
  Note: require("../assets/note.png"),
  Notice: require("../assets/notification.png"),
  User: require("../assets/user.png"),
};

// Reusable single button
export function MenuButton({ label, target, isCenter }) {
  const navigation = useNavigation();
  const icon = icons[label] || icons["home"];

  return (
    <TouchableOpacity 
      onPress={() => target && navigation.navigate(target)}
      style={[styles.menuBtn, isCenter && styles.centerBtn]}
    >
      <Image source={icon} style={[styles.menuIcon, isCenter && styles.centerIcon]} />
      {!isCenter && <Text style={styles.menuText}>{label}</Text>}
    </TouchableOpacity>
  );
}

// Full bottom menu bar
export function BottomMenu() {
  return (
    <View style={styles.bottomMenu}>
      <MenuButton label="Home"   target="Home" />
      <MenuButton label="Overview"  target="Summary" />
      <MenuButton label="Note"   isCenter target="Record" />
      <MenuButton label="Notice" target="Notice"/>
      <MenuButton label="User" target="User"/>
    </View>
  );
}

const styles = StyleSheet.create({
  // bottom bar
  bottomMenu: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#292929",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingLeft: 20,
    paddingRight: 20,
    paddingBottom: Platform.OS === "ios" ? 32 : 20,
  },
  // button styles
  menuBtn: { 
    alignItems: "center", 
    justifyContent: "center", 
    paddingVertical: 10 
  },
  menuIcon: { 
    width: 30, 
    height: 30, 
    marginBottom: 4, 
    tintColor: "#fff" 
  },
  menuText: { 
    color: "#e5e7eb", 
    fontSize: 12, 
    textAlign: "center" 
  },
  // special style for middle button
  centerBtn: { 
    backgroundColor: "#3b82f6", 
    width: 60, 
    height: 60, 
    borderRadius: 30, 
    marginBottom: 20
  },
  centerIcon: { 
    width: 28, 
    height: 28 
  },
});
