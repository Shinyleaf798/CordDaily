import React, { useState, useEffect, useMemo } from "react";
import {
  SafeAreaView, View, Text, StyleSheet, ScrollView,
  TouchableOpacity, TextInput, ImageBackground, Image, KeyboardAvoidingView, Platform
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { BottomMenu } from "../global_function/menuButton";
import { useBills } from "../global_function/billsContent";
import { getUser } from "../global_function/localStorage";

/* Category meta (unchanged) */
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
const CAT_MAP = [...EXPENDITURE_CATS, ...INCOME_CATS].reduce((acc, c) => {
  acc[c.id] = c; return acc;
}, {});
const getCatMeta = (cat) => {
  const key = String(cat || "").toLowerCase();
  return CAT_MAP[key] || { label: cat ?? "Unknown", icon: require("../assets/lunch.png") };
};

/* Date helpers (LOCAL timezone safe) */
function parseLocalDateTime(str) {
  if (!str) return null;

  // Split into date + optional time
  const [datePart, timePart = "00:00:00"] = str.split(/[\sT]/);

  // Break down date
  const [year, month, day] = datePart.split("-").map(Number);

  // Break down time (defaults to 00:00:00 if missing)
  const [hour = 0, minute = 0, second = 0] = timePart.split(":").map(Number);

  // Construct local Date
  return new Date(year, month - 1, day, hour, minute, second);
}

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const formatDate = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const dayKey = (d) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
};

export default function HomeScreen() {
  const navigation = useNavigation();
  const { bills, loading, deleteBill, syncFromServer } = useBills();

  /* UI state */
  const [actionOpen, setActionOpen] = useState(false);
  const [selectedBill, setSelectedBill] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showBudgetPanel, setShowBudgetPanel] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const [monthlyBudget, setMonthlyBudget] = useState(500);
  const [currency, setCurrency] = useState("RM");

  /* User currency */
  useEffect(() => {
    (async () => {
      const u = await getUser();
      if (u?.defaultCurrency) setCurrency(u.defaultCurrency);
    })();
  }, []);

  /* Precompute parsed dates once */
  const billsWithDate = useMemo(() => {
    return (bills || [])
      .map(b => ({ ...b, _dateObj: parseLocalDateTime(b.date) }))
      .filter(b => b._dateObj); // keep only valid dates
  }, [bills]);

  /* Month & ranges */
  const now = new Date();
  const monthTitle = now.toLocaleString("en-GB", { month: "long" });
  const monthStart = useMemo(() => new Date(now.getFullYear(), now.getMonth(), 1), [now]);
  const nextMonthStart = useMemo(() => new Date(now.getFullYear(), now.getMonth() + 1, 1), [now]);

  /* This-month list & totals */
  const monthlyBills = useMemo(() => {
    return billsWithDate.filter(b => b._dateObj >= monthStart && b._dateObj < nextMonthStart);
  }, [billsWithDate, monthStart, nextMonthStart]);

  const totalExpense = useMemo(() => {
    return monthlyBills
      .filter(b => Number(b.amount) < 0)
      .reduce((sum, b) => sum + Math.abs(Number(b.amount)), 0);
  }, [monthlyBills]);

  const remainBudget = useMemo(() => Number(monthlyBudget) - totalExpense, [monthlyBudget, totalExpense]);
  const overspend = remainBudget < 0 ? Math.abs(remainBudget) : 0;

  /* 7-day list (today + previous 6) */
  const sevenDayBills = useMemo(() => {
    const today0 = startOfDay(new Date());
    const windowStart = addDays(today0, -6);
    const windowEnd = addDays(today0, 1); // exclusive
    return billsWithDate
      .filter(b => b._dateObj >= windowStart && b._dateObj < windowEnd)
      .sort((a, b) => b._dateObj - a._dateObj);
  }, [billsWithDate]);

  /* Actions */
  const openBillActions = (bill) => { setSelectedBill(bill); setActionOpen(true); };
  const closeBillActions = () => { setSelectedBill(null); setActionOpen(false); };

  async function confirmDelete() {
    if (!selectedBill) return;
    try {
      const id = selectedBill.id ?? selectedBill.billsID;
      await deleteBill(id);
      await syncFromServer();
    } catch (e) {
      console.error("Delete failed:", e);
    } finally {
      setShowDeleteConfirm(false);
      closeBillActions();
    }
  }

  const openBudgetPanel = () => { setBudgetInput(String(monthlyBudget ?? "")); setShowBudgetPanel(true); };
  const saveBudgetFromPanel = () => {
    const v = parseFloat(budgetInput);
    if (!isNaN(v) && v >= 0) setMonthlyBudget(v);
    setShowBudgetPanel(false);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.ledgerStyle}>
          <Text style={styles.ledgerColor}>Personal Ledge</Text>
          <TouchableOpacity onPress={() => navigation.navigate("AllBills")}>
            <Image source={require("../assets/bill.png")} style={styles.allBillStyle} />
          </TouchableOpacity>
        </View>

        {/* Top card + monthly numbers */}
        <View style={styles.monthlyBox}>
          <ImageBackground
            source={require("../assets/Cardbackground.png")}
            resizeMode="cover"
            style={styles.topCard}
            imageStyle={{ borderRadius: 16 }}
          >
            <Text style={styles.topTitle}>{monthTitle} - Expenditure</Text>
            <Text style={styles.topAmount}>{currency} {totalExpense.toFixed(2)}</Text>
          </ImageBackground>

          <View style={styles.row}>
            <Text style={styles.sectionTitle}>Monthly Budget</Text>
            <TouchableOpacity onPress={openBudgetPanel} style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
              <Text style={styles.balanceText}>Enter Balance</Text>
              <Image source={require("../assets/pen.png")} style={{ width: 15, height: 15, marginLeft: 6 }} />
            </TouchableOpacity>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Budget :</Text>
            <Text style={{ color: "#22c55e", fontWeight: "700" }}>
              {currency} {Number(monthlyBudget || 0).toFixed(2)}
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Remain Budget :</Text>
            <Text style={{ color: remainBudget >= 0 ? "#22c55e" : "#f87171", fontWeight: "700" }}>
              {currency} {remainBudget.toFixed(2)}
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Overspend :</Text>
            <Text style={{ color: "#f87171", fontWeight: "700" }}>
              {currency} {overspend.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Last 7 days list */}
        <Text style={styles.dividerText}>---------------------- Last 7 days bill ----------------------</Text>

        <View style={styles.dailyList}>
          {sevenDayBills.length === 0 ? (
            <Text style={styles.dateText}>No bills</Text>
          ) : (
            sevenDayBills.map((item, idx) => {
              const prev = sevenDayBills[idx - 1];
              const showHeader = idx === 0 || dayKey(item._dateObj) !== (prev ? dayKey(prev._dateObj) : "");
              return (
                <View key={String(item.billsID ?? item.id ?? `${dayKey(item._dateObj)}-${idx}`)}>
                  {showHeader && <Text style={styles.dateText}>{formatDate(item._dateObj)}</Text>}
                  <BillItem item={item} currency={currency} onPress={() => openBillActions(item)} />
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Budget Center Panel */}
      {showBudgetPanel && (
        <>
          <TouchableOpacity activeOpacity={1} onPress={() => setShowBudgetPanel(false)} style={styles.budgetBackdrop} />
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.budgetCenterWrap}>
            <View style={styles.budgetCenterCard}>
              <Text style={styles.budgetTitle}>Set Monthly Budget</Text>
              <TextInput
                value={budgetInput}
                onChangeText={setBudgetInput}
                keyboardType="numeric"
                placeholder="e.g. 500"
                placeholderTextColor="#777"
                style={styles.budgetInput}
              />
              <View style={styles.budgetActions}>
                <TouchableOpacity style={[styles.budgetBtn, styles.budgetCancel]} onPress={() => setShowBudgetPanel(false)}>
                  <Text style={styles.budgetBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.budgetBtn, styles.budgetSave]} onPress={saveBudgetFromPanel}>
                  <Text style={styles.budgetBtnText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </>
      )}

      {/* Bottom action sheet */}
      {actionOpen && selectedBill && (
        <>
          <TouchableOpacity style={styles.actionBackdrop} onPress={closeBillActions} activeOpacity={1} />
          <View style={styles.actionSheet}>
            <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
              <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>
                {selectedBill.subject || "Bill"}
              </Text>
              <Text style={{ color: "#9ca3af", marginTop: 4, fontSize: 12 }}>
                {formatDate(selectedBill._dateObj || parseLocalDateTime(selectedBill.date))}
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

            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#ef4444" }]} onPress={() => setShowDeleteConfirm(true)}>
              <Text style={styles.actionBtnText}>Delete</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#2a2a2a" }]} onPress={closeBillActions}>
              <Text style={styles.actionBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Inline Delete Confirm */}
      {showDeleteConfirm && (
        <>
          <TouchableOpacity style={styles.actionBackdrop} onPress={() => setShowDeleteConfirm(false)} activeOpacity={1} />
          <View style={styles.confirmCard}>
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700", marginBottom: 8 }}>Delete this bill?</Text>
            <Text style={{ color: "#9ca3af", marginBottom: 16 }}>This action cannot be undone.</Text>
            <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
              <TouchableOpacity onPress={() => setShowDeleteConfirm(false)} style={[styles.confirmBtn, { backgroundColor: "#2a2a2a" }]}>
                <Text style={styles.actionBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmDelete} style={[styles.confirmBtn, { backgroundColor: "#ef4444", marginLeft: 8 }]}>
                <Text style={styles.actionBtnText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}

      <BottomMenu />
    </SafeAreaView>
  );
}

/* ---------- Row ---------- */
function BillItem({ item, currency, onPress }) {
  const { icon, label } = getCatMeta(item.category);
  const amt = Number(item.amount) || 0;
  const isExpense = amt < 0;
  return (
    <TouchableOpacity style={styles.billCard} onPress={onPress} activeOpacity={0.85}>
      <View style={{ width: 60, alignItems: "center" }}>
        <Image source={icon} style={styles.billIcon} />
        <Text style={styles.catLabel}>{label}</Text>
      </View>

      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={styles.subjectText}>{item.subject}</Text>
        {!!item.remark && <Text style={styles.remarkText}>Remark: {item.remark}</Text>}
      </View>

      <View style={{ alignItems: "flex-end", gap: 6 }}>
        <Text style={[styles.billAmount, { color: isExpense ? "#f87171" : "#22c55e" }]}>
          {isExpense ? `-${currency} ${Math.abs(amt).toFixed(2)}` : `${currency} ${amt.toFixed(2)}`}
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

/* ---------- Styles (unchanged) ---------- */
const styles = StyleSheet.create({
  screen: { 
    flex: 1, 
    backgroundColor: "#070707ff" 
  },
  content: { 
    paddingTop: 20, 
    padding: 16, 
    paddingBottom: 120 
  },

  ledgerStyle: { 
    flexDirection: "row", 
    justifyContent: "space-between", 
    alignItems: "center", 
    paddingTop: 20, 
    paddingLeft: 10, 
    paddingBottom: 10 
  },
  ledgerColor: { 
    color: "white", 
    fontSize: 16 
  },
  allBillStyle: { 
    color: "#fff", 
    width:30, 
    height: 30 
  },

  monthlyBox: { 
    padding: 16, 
    marginBottom: 16, 
    backgroundColor: "#131313", 
    borderRadius: 16 
  },
  topCard: { 
    borderRadius: 16, 
    padding: 16, 
    backgroundColor: "#1f2937", 
    marginBottom: 12 
  },
  topTitle: { 
    color: "#000000", 
    fontSize: 20, 
    marginBottom: 4 
  },
  topAmount: { 
    color: "#000000", 
    fontSize: 40, 
    fontWeight: "600" 
  },

  sectionTitle: { 
    color: "#e5e7eb", 
    fontSize: 18, 
    fontWeight: "700", 
    marginBottom: 12 
  },
  balanceText: { 
    color: "#B3A6A6", 
    fontSize: 15 
  },
  row: { 
    flexDirection: "row", 
    justifyContent: "space-between", 
    marginBottom: 6 
  },
  label: { 
    color: "#cbd5e1" 
  },

  budgetBackdrop: { 
    position: "absolute", 
    left: 0, 
    right: 0, 
    top: 0, 
    bottom: 0, 
    backgroundColor: "rgba(0,0,0,0.6)" 
  },
  budgetCenterWrap: { 
    position: "absolute", 
    left: 0, 
    right: 0, 
    top: 0, 
    bottom: 0, 
    alignItems: "center", 
    justifyContent: "center" 
  },
  budgetCenterCard: { 
    width: "80%", 
    backgroundColor: "#111111", 
    borderRadius: 16, 
    paddingVertical: 20, 
    paddingHorizontal: 16 
  },
  budgetTitle: { 
    color: "#eee", 
    fontSize: 16, 
    fontWeight: "700",
    marginBottom: 12 
  },
  budgetInput: { 
    backgroundColor: "#1b1b1b", 
    color: "#fff", 
    borderRadius: 10, 
    paddingHorizontal: 12, 
    height: 44, fontSize: 16 
  },
  budgetActions: { 
    flexDirection: "row", 
    justifyContent: "flex-end", 
    marginTop: 12 
  },
  budgetBtn: { 
    paddingHorizontal: 14, 
    paddingVertical: 10, 
    borderRadius: 10, 
    marginLeft: 8 
  },
  budgetCancel: { 
    backgroundColor: "#2a2a2a" 
  },
  budgetSave: { 
    backgroundColor: "#3b82f6" 
  },
  budgetBtnText: { 
    color: "#fff", 
    fontWeight: "700" 
  },
  dividerText: { 
    color: "#9ca3af", 
    textAlign: "center" 
  },
  dailyList: { 
    marginBottom: 5 
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
    alignItems: "center" 
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
    left: 0, 
    right: 0, 
    top: 0, 
    bottom: 0, 
    backgroundColor: "rgba(0,0,0,0.6)" 
  },
  actionSheet: { 
    position: "absolute", 
    left: 0, 
    right: 0, 
    bottom: 0, 
    backgroundColor: "#111111", 
    borderTopLeftRadius: 16, 
    borderTopRightRadius: 16, 
    paddingBottom: 130, 
    paddingTop: 8 
  },
  actionBtn: { 
    backgroundColor: "#3b82f6", 
    marginHorizontal: 16, 
    marginTop: 10, 
    paddingVertical: 12, 
    borderRadius: 12, 
    alignItems: "center" 
  },
  actionBtnText: { 
    color: "#fff", 
    fontWeight: "700", 
    fontSize: 15 
  },
  confirmCard: { 
    position: "absolute", 
    left: 20, 
    right: 20, 
    top: "35%", 
    backgroundColor: "#111111", 
    borderRadius: 16, 
    padding: 16, 
    borderWidth: 1, 
    borderColor: "#262626" 
  },
  confirmBtn: { 
    paddingHorizontal: 16, 
    paddingVertical: 10, 
    borderRadius: 10 
  },
});
