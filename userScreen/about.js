import React from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { PageHeader } from "../global_function/page_header";


export default function AboutScreen() {
  const VERSION = "1.0.0";
  const REG_NO = "202508018888-1A";

  return (
    <SafeAreaView style={styles.screen}>
      {/* ===== Header ===== */}
      <PageHeader title="About" target="User"/>

      <ScrollView>
        {/* ===== Logo + Version ===== */}
        <View style={styles.logoSection}>
          <Image
            source={require("../assets/app_logo.png")}
            style={styles.logo}
          />
          <Text style={styles.versionText}>Version: {VERSION}</Text>
        </View>

        {/* ===== Registration Number ===== */}
        <View style={styles.regSection}>
          <Text style={styles.regLeft}>Registration number</Text>
          <Text style={styles.regRight}>{REG_NO}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#070707ff" },

  // ===== Header =====
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111111ff",
    paddingTop: 30,
    paddingBottom: 10,
    paddingHorizontal: 12,
  },
  backArrow: { width: 30, height: 30, tintColor: "#fff", marginRight: 8 },
  headerTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    flex: 1,
    textAlign: "center",
  },

  // ===== Logo + Version =====
  logoSection: {
    flex: 1,
    backgroundColor: "#000", // black panel as in your design
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  logo: {
    width: 120,
    height: 120,
    resizeMode: "contain",
    marginBottom: 12,
  },
  versionText: { color: "#fff", fontSize: 14 },

  // ===== Registration =====
  regSection: {
    backgroundColor: "#111111ff",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#2a2a2a",
  },
  regLeft: { 
    color: "#cbd5e1", 
    fontSize: 14 
  },
  regRight: { 
    color: "#cbd5e1", 
    fontSize: 14 
  },
});
