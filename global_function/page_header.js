import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native";
import { useNavigation } from "@react-navigation/native";

export function PageHeader({ title, target }) {
  const navigation = useNavigation();

  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.navigate(target)}>
        <Image
          source={require("../assets/left_arrow.png")}
          style={styles.back}
        />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
      {/* Spacer so title stays centered */}
      <View style={{ width: 30 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111111ff",
    paddingTop: 30,
    paddingBottom: 10,
    paddingHorizontal: 12,
  },
  back: { width: 30, height: 30, tintColor: "#fff", marginRight: 8 },
  headerTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    flex: 1,
    textAlign: "center",
  },
});
