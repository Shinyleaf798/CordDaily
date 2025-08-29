import React, { useMemo, useState, useEffect } from "react";
import {
  SafeAreaView, View, Text, TouchableOpacity, TextInput,
  StyleSheet, ScrollView, Dimensions, Image,
  Platform, Keyboard
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useBills } from "../global_function/billsContent";
import { getUser, getCurrencyRates } from "../global_function/localStorage";

const screen = Dimensions.get("window");
const buttonWidth = screen.width / 4;

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

const SUPPORTED = ["MYR", "USD", "CNY", "GBP"]; // currencies shown in the panel

// Rates are *relative to MYR*: 1 MYR = rate[CODE]
const DEFAULT_RATES = { MYR: 1, USD: 0.22, CNY: 1.58, GBP: 0.17 };

function convert(value, from, to, table) {
  const v = Number(value || 0);
  if (from === to) return v;
  const rFrom = table[from];
  const rTo = table[to];
  if (!rFrom || !rTo) return v;
  return v * (rTo / rFrom);
}

export default function RecordScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const editing = route?.params?.mode === "edit";
  const originalBill = route?.params?.bill;

  const { addBill, editBill, syncFromServer } = useBills();

  const [tab, setTab] = useState("expense");
  const [category, setCategory] = useState(EXPENDITURE_CATS[0].id);
  const [subject, setSubject] = useState("");
  const [remark, setRemark] = useState("");
  const [method, setMethod] = useState("Cash");
  const [showPicker, setShowPicker] = useState(false);
  const [dateStr, setDateStr] = useState(() => new Date().toISOString().split("T")[0]);
  const [amount, setAmount] = useState("0");

  const cats = useMemo(
    () => (tab === "expense" ? EXPENDITURE_CATS : INCOME_CATS),
    [tab]
  );

  // Currency handling
  const [showCurrencyPanel, setShowCurrencyPanel] = useState(false);
  const [inputCurrency, setInputCurrency] = useState("MYR");     
  const [defaultCurrency, setDefaultCurrency] = useState("MYR"); 
  const [rates, setRates] = useState(DEFAULT_RATES);

// Load user default currency once
useEffect(() => {
  (async () => {
    const u = await getUser();
    if (u?.defaultCurrency) {
      setDefaultCurrency(u.defaultCurrency);
      setInputCurrency(u.defaultCurrency);
    }

    const cached = await getCurrencyRates();
    if (cached) {
      // saved the full API response, take its conversion_rates;
      // saved a plain map, use it directly.
      const table = cached.conversion_rates ? cached.conversion_rates : cached;
      // (Optional) keep only the ones you support
      const next = {};
      ["MYR","USD","CNY","GBP"].forEach(k => {
        if (table?.[k] != null) next[k] = table[k];
      });
      // Fallback to defaults if something is missing
      setRates(Object.keys(next).length ? next : DEFAULT_RATES);
    }
  })();
}, []);


  useEffect(() => {
    if (!editing || !originalBill) return;

    // Determine tab from amount sign in the stored defaultCurrency
    const isExpense = Number(originalBill.amount) < 0;
    setTab(isExpense ? "expense" : "income");

    // Basics
    setCategory(originalBill.category ?? EXPENDITURE_CATS[0].id);
    setSubject(originalBill.subject ?? "");
    setRemark(originalBill.remark ?? "");
    setMethod(originalBill.method ?? "Cash");

    // Date
    const d = originalBill.date ? new Date(originalBill.date) : new Date();
    setDateStr(d.toISOString().slice(0, 10)); // YYYY-MM-DD

    // Amount: backend stores in defaultCurrency — show in current inputCurrency
    const absStored = Math.abs(Number(originalBill.amount) || 0);
    const shown = convert(absStored, defaultCurrency, inputCurrency, rates);
    setAmount(shown.toFixed(2));

  }, [editing, originalBill, defaultCurrency]);

  // When user switches input currency inside the panel, convert the *current displayed* amount
  function switchInputCurrency(nextCode) {
    if (nextCode === inputCurrency) return;
    const current = Number(amount || 0);
    const converted = convert(current, inputCurrency, nextCode, rates);
    setInputCurrency(nextCode);
    setAmount(converted.toFixed(2));
  }

  // number entry (keypad)
  const keyPressed = (val) => {
    if (val === "backSpace") {
      setAmount(prev => {
        if (prev === "0") return "0";
        const next = prev.slice(0, -1);
        if (next === "" || next === "-") return "0";
        return next;
      });
      return;
    }
    if (val === ".") {
      setAmount(prev => (prev.includes(".") ? prev : prev + "."));
      return;
    }
    setAmount(prev => {
      const next = prev === "0" ? String(val) : prev + String(val);
      const [i, d] = next.split(".");
      if (d && d.length > 2) return prev;
      if (i.length > 9) return prev;
      return next;
    });
  };

  const createKey = (title, extraStyle = {}) => (
    <TouchableOpacity
      key={title}
      style={[styles.button, extraStyle]}
      onPress={() => keyPressed(title)}
      activeOpacity={0.8}
    >
      <Text style={styles.buttonText}>{title}</Text>
    </TouchableOpacity>
  );

  const [kavKey, setKavKey] = useState(0);
  useEffect(() => {
    const hide = Keyboard.addListener("keyboardDidHide", () => setKavKey(k => k + 1));
    return () => hide.remove();
  }, []);

  const METHODS = ["Cash", "Debit/Visa Card", "Bank"];

  const displayedAmount = useMemo(() => Number(amount || 0).toFixed(2), [amount]);

  // Disable save if subject/remark empty or amount is 0/invalid
  const canSave = useMemo(() => {
    const sOk = subject.trim().length > 0;
    const rOk = remark.trim().length > 0;
    const amt = Number(amount);
    const aOk = Number.isFinite(amt) && amt > 0;   // > 0 only
    return sOk && rOk && aOk;
  }, [subject, remark, amount]);

  const save = async () => {
    const user = await getUser();
    if (!user?.id) { console.error("No userID found in storage!"); return; }

    const entered = Number(amount || 0);
    const valueInDefault = convert(entered, inputCurrency, defaultCurrency, rates);
    const signed = (tab === "expense" ? -1 : 1) * Math.abs(valueInDefault);

    const payload = {
      userID: user.id,
      date: dateStr,
      category,
      subject,
      remark,
      method,
      amount: signed,           
      currency: defaultCurrency,  
      input_currency: inputCurrency,
      input_amount: entered,
    };

    try {
      if (editing && originalBill) {
        const billsID = Number(originalBill.id ?? originalBill.billsID);
        await editBill(billsID, payload);
      } else {
        await addBill(payload);
      }
      await syncFromServer();
      navigation.navigate("Home");
    } catch (e) {
      console.error("Failed to save bill:", e);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity onPress={() => navigation.navigate("Home")}>
          <Image source={require("../assets/left_arrow.png")} style={styles.backArrow} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => { setTab("expense"); setCategory(EXPENDITURE_CATS[0].id); }}
          style={[styles.tabBtn, tab === "expense" && styles.tabActive]}
        >
          <Text style={[styles.tabText, tab === "expense" && styles.tabTextActive]}>
            Expenditure
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => { setTab("income"); setCategory(INCOME_CATS[0].id); }}
          style={[styles.tabBtn, tab === "income" && styles.tabActive]}
        >
          <Text style={[styles.tabText, tab === "income" && styles.tabTextActive]}>
            Income
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {/* Category grid */}
        <View style={styles.catCard}>
          <View style={styles.catGrid}>
            {(tab === "expense" ? EXPENDITURE_CATS : INCOME_CATS).map(c => {
              const active = category === c.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.catItem, active && styles.catItemActive]}
                  onPress={() => setCategory(c.id)}
                  activeOpacity={0.8}
                >
                  <Image source={c.icon} style={styles.catImg} resizeMode="contain" />
                  <Text style={styles.catLabel}>{c.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* Subject + amount + inputs */}
      <View style={styles.formWrapper}>
        <View style={[styles.formRow, { marginTop: 8 }]}>
          <TextInput
            value={subject}
            onChangeText={setSubject}
            placeholder="Subject...."
            placeholderTextColor="#777"
            maxLength={10}
            style={[styles.input, { flex: 1, marginRight: 12 }]}
          />
          <TouchableOpacity onPress={() => setShowCurrencyPanel(true)}>
            <Text style={styles.amountText}>
              {inputCurrency} {displayedAmount}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.formRow, { marginTop: 8 }]}>
          <TextInput
            value={remark}
            onChangeText={setRemark}
            placeholder="Remarks...."
            placeholderTextColor="#777"
            maxLength={50}
            style={[styles.input, { flex: 1 }]}
          />
        </View>

        {/* Date / method / camera */}
        {showPicker && (
          <DateTimePicker
            value={new Date(dateStr)}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            maximumDate={new Date()}
            onChange={(event, selectedDate) => {
              setShowPicker(false);
              if (selectedDate) setDateStr(selectedDate.toISOString().split("T")[0]);
            }}
          />
        )}

        <View style={[styles.formRow, { marginTop: 10 }]}>
          <TouchableOpacity style={styles.chip} onPress={() => setShowPicker(true)}>
            <Text style={styles.chipText}>{dateStr}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, { marginLeft: 8 }]}
            onPress={() =>
              setMethod(m => {
                const idx = METHODS.indexOf(m);
                const nextIdx = (idx + 1) % METHODS.length;
                return METHODS[nextIdx];
              })
            }
          >
            <Text style={styles.chipText}>{method}</Text>
          </TouchableOpacity>
        </View>

        {/* Keypad */}
        <View style={styles.keypadRow}>
          <View style={{ flex: 3 }}>
            <View style={styles.row}>
              {createKey("1")}
              {createKey("2")}
              {createKey("3")}
            </View>
            <View style={styles.row}>
              {createKey("4")}
              {createKey("5")}
              {createKey("6")}
            </View>
            <View style={styles.row}>
              {createKey("7")}
              {createKey("8")}
              {createKey("9")}
            </View>
            <View style={styles.row}>
              <TouchableOpacity onPress={() => keyPressed("0")} style={[styles.button, styles.zeroButton]}>
                <Text style={styles.buttonText}>0</Text>
              </TouchableOpacity>
              {createKey(".")}
            </View>
          </View>

          <View style={{ flex: 1, marginLeft: 8 }}>
            <TouchableOpacity onPress={() => keyPressed("backSpace")} style={styles.backspaceKey}>
              <Image
                source={require("../assets/backspace.png")}
                style={{ width: 40, height: 40, tintColor: "#ddd" }}
                resizeMode="contain"
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveBtn, !canSave && { opacity: 0.5 }]}
              onPress={save}
              disabled={!canSave}
            >
              <Text style={styles.saveText}>S{"\n"}A{"\n"}V{"\n"}E</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Currency Panel */}
      {showCurrencyPanel && (
        <>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setShowCurrencyPanel(false)}
            style={styles.currencyBackdrop}
          />
          <View style={styles.currencyCenterWrap}>
            <View style={styles.currencyCard}>
              <Text style={styles.currencyTitle}>{inputCurrency} equivalents</Text>

              {SUPPORTED.filter(c => c !== inputCurrency).map(code => {
                const entered = Number(amount || 0);
                const converted = convert(entered, inputCurrency, code, rates);
                return (
                  <TouchableOpacity
                    key={code}
                    style={styles.curRow}
                    onPress={() => switchInputCurrency(code)}
                    activeOpacity={0.85}
                  >
                    <View>
                      <Text style={styles.curTopLine}>
                        {code} {converted.toFixed(2)}
                      </Text>
                      <Text style={styles.curSubLine}>
                        from {inputCurrency} {entered.toFixed(2)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity
                style={styles.currencyBtn}
                onPress={() => setShowCurrencyPanel(false)}
              >
                <Text style={styles.currencyBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { 
    flex: 1, 
    backgroundColor: "#070707ff" 
  },

  tabs: {
    flexDirection: "row",
    backgroundColor: "#111111ff",
    paddingTop: 30,
    paddingBottom: 10,
  },
  backArrow: {
    color: "#fff", 
    width: 30, 
    height: 30, 
    marginTop: 3, 
    marginHorizontal: 15
  },
  tabBtn: {
    flex: 1, 
    paddingVertical: 8, 
    marginRight: 20, 
    borderRadius: 8, 
    alignItems: "center"
  },
  tabActive: { 
    backgroundColor: "#2a2a2a" 
  },
  tabText: { 
    color: "#aaa" 
  },
  tabTextActive: { 
    color: "#fff", 
    fontWeight: "700" 
  },
  catCard: { 
    backgroundColor: "#151515", 
    margin: 12, 
    borderRadius: 12, 
    padding: 12 
  },
  catGrid: { 
    flexDirection: "row", 
    flexWrap: "wrap" 
  },
  catItem: { 
    width: "25%", 
    paddingVertical: 10, 
    alignItems: "center" 
  },
  catImg: { 
    width: 40, 
    height: 40, 
    marginBottom: 6 
  },
  catItemActive: { 
    backgroundColor: "#202020", 
    borderRadius: 12 
  },
  catLabel: { 
    color: "#ddd", 
    fontSize: 12 
  },

  formWrapper: { 
    backgroundColor: "#111111ff", 
    paddingTop: 5 
  },
  formRow: { 
    flexDirection: "row", 
    alignItems: "center", 
    paddingHorizontal: 12 
  },
  input: { 
    backgroundColor: "#1b1b1b", 
    color: "#fff", 
    borderRadius: 10, 
    paddingHorizontal: 12, 
    height: 44 
  },
  amountText: { 
    color: "#fff", 
    fontSize: 22, 
    fontWeight: "700" 
  },
  chip: { 
    backgroundColor: "#1b1b1b", 
    borderRadius: 16, 
    paddingHorizontal: 10, 
    paddingVertical: 6 
  },
  chipText: { 
    color: "#eee" 
  },
  keypadRow: { 
    flexDirection: "row", 
    marginTop: 12, 
    paddingHorizontal: 12 
  },
  row: { 
    flexDirection: "row", 
    justifyContent: "space-between", 
    marginBottom: 10 
  },

  button: {
    backgroundColor: "#333",
    width: buttonWidth - 20,
    height: buttonWidth - 20,
    borderRadius: (buttonWidth - 20) / 2,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 5,
  },
  buttonText: { 
    color: "white", 
    fontSize: 28 
  },
  zeroButton: {
    width: buttonWidth * 1.75,
    borderRadius: (buttonWidth - 20) / 2,
    alignItems: "flex-start",
    paddingLeft: 30,
  },
  backspaceKey: {
    height: 50, 
    borderRadius: 12, 
    backgroundColor: "#555",
    alignItems: "center", 
    justifyContent: "center", 
    marginBottom: 10,
  },
  saveBtn: {
    flex: 1, 
    borderRadius: 16, 
    backgroundColor: "#3b82f6",
    alignItems: "center", 
    justifyContent: "center",
  },
  saveText: { 
    color: "#fff", 
    fontSize: 18, 
    fontWeight: "800", 
    lineHeight: 24, 
    textAlign: "center" 
  },

  // Currency panel
  currencyBackdrop: {
    position: "absolute", 
    left: 0, 
    right: 0, 
    top: 0, 
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  currencyCenterWrap: {
    position: "absolute", 
    left: 0, 
    right: 0, 
    top: 0, 
    bottom: 0,
    alignItems: "center", 
    justifyContent: "center",
  },
  currencyCard: {
    width: "85%", 
    backgroundColor: "#111111", 
    borderRadius: 16,
    paddingVertical: 20, 
    paddingHorizontal: 16,
  },
  currencyTitle: { 
    color: "#eee", 
    fontSize: 16, 
    fontWeight: "700", 
    marginBottom: 12 
  },
  curRow: {
    flexDirection: "row", 
    justifyContent: "space-between",
    backgroundColor: "#1b1b1b", 
    borderRadius: 10, 
    padding: 12, 
    marginBottom: 10,
  },
  curTopLine: { 
    color: "#fff", 
    fontSize: 18, 
    fontWeight: "700" 
  },
  curSubLine: { 
    color: "#9ca3af", 
    marginTop: 2 
  },
  currencyBtn: {
    marginTop: 10, 
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#3b82f6",
    alignItems: "center",
  },
  currencyBtnText: { 
    color: "#fff", 
    fontWeight: "700" 
  },
});
