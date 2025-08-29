import React, { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  Image,
  KeyboardAvoidingView,
  Platform,
  TextInput,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useBills } from "../global_function/billsContent";
import { getUser } from "../global_function/localStorage";
import { PageHeader } from "../global_function/page_header";

// ---- Same category meta as Home ----
const EXPENDITURE_CATS = [
  { id: "food", label: "Food", icon: require("../assets/category/expenditure/Food.png") },
  { id: "shopping", label: "Shopping", icon: require("../assets/category/expenditure/Shopping.png") },
  { id: "phone", label: "Phone Bill", icon: require("../assets/category/expenditure/Phone.png") },
  { id: "game", label: "Game", icon: require("../assets/category/expenditure/Game.png") },
  { id: "snack", label: "Snack", icon: require("../assets/category/expenditure/Snack.png") },
  { id: "daily", label: "Daily", icon: require("../assets/category/expenditure/Daily.png") },
];
const INCOME_CATS = [
  { id: "salary", label: "Salary", icon: require("../assets/category/income/Salary.png") },
  { id: "bonus", label: "Bonus", icon: require("../assets/category/income/Bonus.png") },
  { id: "investment", label: "Investment", icon: require("../assets/category/income/Investment.png") },
  { id: "financial", label: "Financial", icon: require("../assets/category/income/Financial.png") },
  { id: "part-time", label: "Part-time", icon: require("../assets/category/income/Part-time.png") },
];
const ALL_CATS = [...EXPENDITURE_CATS, ...INCOME_CATS];
const CAT_MAP = ALL_CATS.reduce((acc, c) => { acc[c.id] = c; return acc; }, {});
const getCatMeta = (cat) => {
  const key = String(cat || "").toLowerCase();
  return CAT_MAP[key] || { label: cat ?? "Unknown", icon: require("../assets/lunch.png") };
};

const dayKey = (iso) => String(iso).slice(0, 10);
const formatDate = (iso) => new Date(iso).toLocaleDateString("en-GB", {
  day: "numeric", month: "long", year: "numeric",
});

export default function AllBillsScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { bills, loading, deleteBill, syncFromServer } = useBills();

  // Currency (same as Home) 
  const [currency, setCurrency] = useState("RM");
  useEffect(() => {
    (async () => {
      const u = await getUser();
      if (u?.defaultCurrency) setCurrency(u.defaultCurrency);
    })();
  }, []);

  // Source data 
  const incoming = Array.isArray(route.params?.allBills) ? route.params.allBills : bills;

  // normalize + sort desc by date
  const allBills = useMemo(() => {
    return [...incoming]
      .map(b => ({ ...b, _date: b.date || b.created_at || b.updated_at || b.time }))
      .filter(b => b._date)
      .sort((a, b) => (new Date(b._date) - new Date(a._date)));
  }, [incoming]);

  // Build sections by day (newest day first)
  const sections = useMemo(() => {
    const groups = new Map();
    for (const b of allBills) {
      const key = dayKey(b._date);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(b);
    }
    return Array.from(groups.entries())
      .sort((a, b) => (new Date(b[0]) - new Date(a[0])))
      .map(([key, items]) => ({ title: formatDate(key), data: items }));
  }, [allBills]);

  // Action sheet state (same behavior as Home)
  const [actionOpen, setActionOpen] = useState(false);
  const [selectedBill, setSelectedBill] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  function openBillActions(bill) {
    setSelectedBill(bill);
    setActionOpen(true);
  }
  function closeBillActions() {
    setSelectedBill(null);
    setActionOpen(false);
  }

  async function confirmDelete() {
    if (!selectedBill) return;
    const id = selectedBill.id ?? selectedBill.billsID;
    try {
      await deleteBill(id);  
      await syncFromServer();    // refresh
    } catch (e) {
      console.error("Delete failed:", e);
    } finally {
      setShowDeleteConfirm(false);
      closeBillActions();
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      {/* Header (same vibe as Home) */}
      <PageHeader title="All bills" target="Home" />

      {/* Small caption like Home’s divider */}
      <Text style={styles.dividerText}>
        ------------------------ All bills by date ------------------------
      </Text>

      {/* Sectioned list of every date */}
      <SectionList
        sections={sections}
        keyExtractor={(item, idx) => String(item.billsID ?? item.id ?? idx)}
        stickySectionHeadersEnabled
        renderSectionHeader={({ section }) => (
          <Text style={styles.dateText}>{section.title}</Text>
        )}
        renderItem={({ item }) => (
          <BillItem
            item={item}
            currency={currency}
            onPress={() => openBillActions(item)}
          />
        )}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
      />

      {/* ===== Bottom action sheet (Edit / Delete / Cancel) ===== */}
      {actionOpen && selectedBill && (
        <>
          <TouchableOpacity
            style={styles.actionBackdrop}
            onPress={closeBillActions}
            activeOpacity={1}
          />
          <View style={styles.actionSheet}>
            <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
              <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>
                {selectedBill.subject || "Bill"}
              </Text>
              <Text style={{ color: "#9ca3af", marginTop: 4, fontSize: 12 }}>
                {new Date(selectedBill._date || selectedBill.date).toLocaleDateString()}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => {
                closeBillActions();
                navigation.navigate("Record", { mode: "edit", bill: selectedBill });
              }}
            >
              <Text style={styles.actionBtnText}>Edit</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: "#ef4444" }]}
              onPress={() => setShowDeleteConfirm(true)}
            >
              <Text style={styles.actionBtnText}>Delete</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: "#2a2a2a" }]}
              onPress={closeBillActions}
            >
              <Text style={styles.actionBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* ===== Inline Delete Confirm ===== */}
      {showDeleteConfirm && (
        <>
          <TouchableOpacity
            style={styles.actionBackdrop}
            onPress={() => setShowDeleteConfirm(false)}
            activeOpacity={1}
          />
          <View style={styles.confirmCard}>
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700", marginBottom: 8 }}>
              Delete this bill?
            </Text>
            <Text style={{ color: "#9ca3af", marginBottom: 16 }}>
              This action cannot be undone.
            </Text>
            <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
              <TouchableOpacity
                onPress={() => setShowDeleteConfirm(false)}
                style={[styles.confirmBtn, { backgroundColor: "#2a2a2a" }]}
              >
                <Text style={styles.actionBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmDelete}
                style={[styles.confirmBtn, { backgroundColor: "#ef4444", marginLeft: 8 }]}
              >
                <Text style={styles.actionBtnText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

function BillItem({ item, currency, onPress }) {
  const { icon, label } = getCatMeta(item.category);
  return (
    <TouchableOpacity style={styles.billCard} onPress={onPress} activeOpacity={0.85}>
      {/* left: icon + category label (same as Home) */}
      <View style={{ width: 60, alignItems: "center" }}>
        <Image source={icon} style={styles.billIcon} />
        <Text style={styles.catLabel}>{label}</Text>
      </View>

      {/* middle */}
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={styles.subjectText}>{item.subject}</Text>
        {!!item.remark && <Text style={styles.remarkText}>Remark: {item.remark}</Text>}
      </View>

      {/* right */}
      <View style={{ alignItems: "flex-end", gap: 6 }}>
        <Text
          style={[
            styles.billAmount,
            { color: item.amount < 0 ? "#f87171" : "#22c55e" },
          ]}
        >
          {item.amount < 0
            ? `-${currency} ${Math.abs(item.amount).toFixed(2)}`
            : `${currency} ${Number(item.amount).toFixed(2)}`}
        </Text>
        {!!item.method && (
          <View style={styles.methodPill}>
            <Text style={styles.methodPillText}>{item.method}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ===== Styles cloned to match Home =====
const styles = StyleSheet.create({
  screen: { 
    flex: 1, 
    backgroundColor: "#070707ff" 
  },
  dividerText: { 
    color: "#9ca3af", 
    textAlign: "center" 
  },
  dateText: { 
    color: "#9ca3af", 
    marginTop: 8, 
    marginBottom: 4 
  },

  billCard: {
    backgroundColor: "#131313",
    borderRadius: 16,
    padding: 12,
    marginBottom: 6,
    flexDirection: "row",
    alignItems: "center",
  },
  billIcon: { 
    width: 40, 
    height: 40, 
    borderRadius: 20 
  },
  catLabel: { 
    color: "#9ca3af", 
    fontSize: 12, 
    marginTop: 4 
  },
  subjectText: { 
    color: "#e5e7eb", 
    fontSize: 15, 
    fontWeight: "600" 
  },
  remarkText: { 
    color: "#9ca3af", 
    marginTop: 2, 
    fontSize: 13 
  },
  billAmount: { 
    color: "#f3f4f6", 
    fontSize: 18, 
    fontWeight: "500" 
  },
  methodPill: { 
    backgroundColor: "#1f2937", 
    paddingHorizontal: 10, 
    paddingVertical: 4, 
    borderRadius: 999 
  },
  methodPillText: { 
    color: "#cbd5e1", 
    fontSize: 12 
  },

  actionBackdrop: {
    position: "absolute",
    left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  actionSheet: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    backgroundColor: "#111111",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 130,
    paddingTop: 8,
  },
  actionBtn: {
    backgroundColor: "#3b82f6",
    marginHorizontal: 16,
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  actionBtnText: { 
    color: "#fff", 
    fontWeight: "700", 
    fontSize: 15 
  },

  confirmCard: {
    position: "absolute",
    left: 20, right: 20, top: "35%",
    backgroundColor: "#111111",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#262626",
  },
  confirmBtn: { 
    paddingHorizontal: 16, 
    paddingVertical: 10, 
    borderRadius: 10 
  },
});
