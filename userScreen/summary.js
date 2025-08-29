import React, { useMemo, useState, useEffect } from "react";
import {
  SafeAreaView, View, Text, TouchableOpacity, StyleSheet,
  Image, Dimensions, ScrollView
} from "react-native";
import { VictoryPie } from 'victory-native';
import { Text as SvgText } from "react-native-svg";
import { useBills } from "../global_function/billsContent";
import { getUser } from "../global_function/localStorage";

const { width } = Dimensions.get("window");

// Date helpers (Monday-start week) 
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const PALETTE = [
  "#4ade80","#60a5fa","#f87171","#fbbf24","#a78bfa",
  "#34d399","#f472b6","#22d3ee","#fb923c","#93c5fd"
];


// 0=Mon ... 6=Sun
function dowMon(d){ 
    return (d.getDay() + 6) % 7; 
}

function stripTime(d){ 
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()); 
}

function startOfWeekMonday(d){
  const x = stripTime(d);
  const diff = dowMon(x);        // 0 if Monday
  x.setDate(x.getDate() - diff); // back to Monday
  return x;
}
function endOfWeekMonday(d){ 
    const s = startOfWeekMonday(d); 
    const e = new Date(s); 
    e.setDate(s.getDate()+6); 
    return e; 
}

function startOfMonth(d){ 
    return new Date(d.getFullYear(), d.getMonth(), 1); 
}
function endOfMonth(d){ 
    return new Date(d.getFullYear(), d.getMonth()+1, 0); 
}
function startOfYear(d){ 
    return new Date(d.getFullYear(), 0, 1); 
}
function endOfYear(d){ 
    return new Date(d.getFullYear(), 11, 31); 
}

function addWeeks(d, n){ 
    const x = new Date(d); 
    x.setDate(x.getDate()+n*7); 
    return x; 
}
function addMonths(d, n){ 
    const x = new Date(d); 
    x.setMonth(x.getMonth()+n); 
    return x; 
}
function addYears(d, n){ 
    const x = new Date(d); 
    x.setFullYear(x.getFullYear()+n); 
    return x; 
}

function fmtDM(date){ 
    return `${date.getDate()} ${MONTH_SHORT[date.getMonth()]}`; 
}

function getRangeLabel(mode, anchor){
  if (mode === "week") {
    const s = startOfWeekMonday(anchor), e = endOfWeekMonday(anchor);
    return `${fmtDM(s)} ~ ${fmtDM(e)}`;
  }
  if (mode === "month") 
    return `${MONTH_SHORT[anchor.getMonth()]} ${anchor.getFullYear()}`;

  return String(anchor.getFullYear());
}

function inRange(mode, anchor, d) {
  let s, e;
  if (mode === "week")      { s = startOfWeekMonday(anchor); e = endOfWeekMonday(anchor); }
  else if (mode === "month"){ s = startOfMonth(anchor);      e = endOfMonth(anchor); }
  else                      { s = startOfYear(anchor);       e = endOfYear(anchor); }

  // compare by date-only (local), so 24 Aug counts regardless of time/offset
  const dd = stripTime(d);
  return dd >= stripTime(s) && dd <= stripTime(e);
}

// Days elapsed within the visible range (clamped to today so averages are “so far”)
function daysElapsedInRange(mode, anchor, today = new Date()){
  let s, e;
  if (mode === "week")      { s = startOfWeekMonday(anchor); e = endOfWeekMonday(anchor); }
  else if (mode === "month"){ s = startOfMonth(anchor);      e = endOfMonth(anchor); }
  else                      { s = startOfYear(anchor);       e = endOfYear(anchor); }

  const T = stripTime(today);
  const effEnd = T < s ? s : (T > e ? e : T);
  const ms = effEnd - s;
  const days = Math.floor(ms / (1000 * 60 * 60 * 24)) + 1; // +1 so first day counts
  return Math.max(1, days);
}

// Clamp forward nav so we never go past the current period
function canGoForward(mode, nextAnchor, today = new Date()){
  if (mode === "week") {
    const currStart = startOfWeekMonday(today);
    const nextStart = startOfWeekMonday(nextAnchor);
    return nextStart <= currStart;
  }
  if (mode === "month") {
    const a = nextAnchor, b = today;
    // allow if next year-month <= current year-month
    return a.getFullYear() < b.getFullYear() ||
           (a.getFullYear() === b.getFullYear() && a.getMonth() <= b.getMonth());
  }
  // year
  return nextAnchor.getFullYear() <= today.getFullYear();
}

function groupByCategory(records){
  const m = new Map(); let total = 0;
  records.forEach(r => {
    const val = Math.abs(Number(r.amount) || 0); // ensure positive
    const key = r.category || "Unknown";
    m.set(key, (m.get(key)||0) + val);
    total += val;
  });
  const items = [...m.entries()].map(([category, value]) => ({ category, value }))
    .sort((a, b) => b.value - a.value);
  return { items, total };
}

// currency-aware formatter (label only; numbers already stored in user's default currency)
const formatAmount = (n, currency) => `${currency} ${Number(n || 0).toFixed(2)}`;

// Pie component
function Pie({ data, radius = width * 0.32, innerRadius = width * 0.12 }) {
  // total for percentage labels
  const total = Math.max(1, data.reduce((s, d) => s + d.value, 0));

  // map {category, value} items to the chart’s expected format
  const pieData = data.map((item, index) => ({
    key: `${item.category}-${index}`,
    value: item.value,
    svg: { fill: PALETTE[index % PALETTE.length] },
    arc: { cornerRadius: 6 }, // rounded edges (optional)
  }));

  // percentage labels rendered as a child of PieChart
  const Labels = ({ slices }) =>
    slices.map((slice, index) => {
      const { pieCentroid, data } = slice;
      const pct = Math.round((data.value / total) * 100);
      if (pct < 8) return null; // hide tiny slices
      return (
        <SvgText
          key={`label-${index}`}
          x={pieCentroid[0]}
          y={pieCentroid[1]}
          fill="#111"
          fontSize="12"
          fontWeight="bold"
          textAnchor="middle"
          alignmentBaseline="middle"
        >
          {`${pct}%`}
        </SvgText>
      );
    });

  // size the SVG to your chosen radius
  const size = Math.round(radius * 2 + 16);

  return (
    <VictoryPie
      data={data.map(d => ({ x: d.category, y: d.value }))}
      innerRadius={40}
      padAngle={2}
      height={220}
    />
  );
}

// Screen 
export default function StatsScreen({ navigation, route }){
  // get all real bills from context
  const { bills } = useBills();

  // show amounts with user's default currency label
  const [userCurrency, setUserCurrency] = useState("MYR");
  useEffect(() => {
    (async () => {
      const u = await getUser();
      if (u?.defaultCurrency) setUserCurrency(u.defaultCurrency);
    })();
  }, []);

    // If the caller explicitly passed transactions, use them; otherwise use all bills
  const all = useMemo(() => {
    const src = route?.params?.transactions ?? bills ?? [];
    // normalize dates to string and amounts to number just in case
    return src.map(t => ({
      ...t,
      date: t.date,
      amount: Number(t.amount) || 0,
    }));
  }, [route?.params?.transactions, bills]);

  // Set Week / Month / Year
  const [mode, setMode] = useState("week");
  // Option date that arrows move
  const [anchor, setAnchor] = useState(new Date());
  // Set Expenditure / Income
  const [kind, setKind] = useState("expense");

  // Filter to current range + kind
  const ranged = useMemo(() => {
    return all.filter(t => inRange(mode, anchor, new Date(t.date)));
  }, [all, mode, anchor]);

  const filtered = useMemo(() => 
    ranged.filter(t => 
      kind === "expense" ? t.amount < 0 : t.amount > 0
    ),
    [ranged, kind]
  );

  const byCat = useMemo(() => groupByCategory(filtered), [filtered]);

  const days = daysElapsedInRange(mode, anchor, new Date());
  const avgDaily = byCat.total / days;

  // Handlers for arrows with clamping
  const goPrev = () => {
    if (mode === "week")  {
        setAnchor(a => addWeeks(a, -1));
    } else if (mode === "month") {
        setAnchor(a => addMonths(a, -1));
    } else {
        setAnchor(a => addYears(a, -1));
    }
  };

  const goNext = () => {
    if (mode === "week") {
      setAnchor(a => {
        const next = addWeeks(a, +1);
        return canGoForward("week", next) ? next : a;
        });
    } else if (mode === "month") {
      setAnchor(a => {
        const next = addMonths(a, +1);
        return canGoForward("month", next) ? next : a;
      });
    } else {
      setAnchor(a => {
        const next = addYears(a, +1);
        return canGoForward("year", next) ? next : a;
      });
    }
  };

  // When changing tab (mode), reset anchor to today to avoid being stuck in old period
  const onSetMode = (m) => { setMode(m); setAnchor(new Date()); };

  const capitalizeFirst = (s) =>
  s && typeof s === "string"
    ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
    : "";


  return (
    <SafeAreaView style={styles.screen}>
      {/* Header tabs (match recordDaily.js style) */}
      <View style={styles.tabs}>
        <TouchableOpacity onPress={() => navigation.navigate("Home")}>
          <Image source={require("../assets/left_arrow.png")} style={styles.backArrow} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => onSetMode("week")}
          style={[styles.tabBtn, mode === "week" && styles.tabActive]}>
          <Text style={[styles.tabText, mode === "week" && styles.tabTextActive]}>Week</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => onSetMode("month")}
          style={[styles.tabBtn, mode === "month" && styles.tabActive]}>
          <Text style={[styles.tabText, mode === "month" && styles.tabTextActive]}>Month</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => onSetMode("year")}
          style={[styles.tabBtn, mode === "year" && styles.tabActive]}>
          <Text style={[styles.tabText, mode === "year" && styles.tabTextActive]}>Year</Text>
        </TouchableOpacity>
      </View>

      {/* Range bar with arrows */}
      <View style={styles.rangeRow}>
        <TouchableOpacity style={styles.arrowBtn} onPress={goPrev}>
          <Text style={{ color:"#fff" }}>⬅︎</Text>
        </TouchableOpacity>

        <Text style={styles.rangeText}>{getRangeLabel(mode, anchor)}</Text>

        <TouchableOpacity style={styles.arrowBtn} onPress={goNext}>
          <Text style={{ color:"#fff" }}>➡︎</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {/* Chart card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardHeaderText}>🧭 Classification Statistics</Text>
          </View>

          <Pie data={byCat.items.length ? byCat.items : [{ category: "No data", value: 1 }]} />
          {/* Legend: color → category */}
          <View style={{ marginTop: 10 }}>
            {byCat.items.length ? (
              byCat.items.map((it, idx) => (
                <View key={`${it.category}-${idx}`} style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                  <View style={{
                    width: 12, height: 12, borderRadius: 6, marginRight: 8,
                    backgroundColor: PALETTE[idx % PALETTE.length]
                  }} />
                  <Text style={{ color: "#ddd" }}>
                    {capitalizeFirst(it.category)} — {formatAmount(it.value, userCurrency)}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={{ color: "#aaa" }}>No data</Text>
            )}
          </View>

          {/* Inside-card toggle for kind */}
          <View style={styles.kindTabs}>
            <TouchableOpacity
              onPress={() => setKind("expense")}
              style={[styles.kindBtn, kind === "expense" && styles.kindBtnActive]}>
              <Text style={[styles.kindText, kind === "expense" && styles.kindTextActive]}>Expenditure</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setKind("income")}
              style={[styles.kindBtn, kind === "income" && styles.kindBtnActive]}>
              <Text style={[styles.kindText, kind === "income" && styles.kindTextActive]}>Income</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Summary card */}
        <View style={styles.card}>
          <View style={styles.summaryHeader}>
            <Text style={styles.cardHeaderText}>📒 Summary</Text>
          </View>

          <View style={[styles.tableRow, styles.tableHead]}>
            <Text style={[styles.th, { flex: 1.4 }]}>Metric</Text>
            <Text style={[styles.th, { flex: 1 }]}>{kind === "income" ? "Income" : "Expenditure"}</Text>
          </View>

          <View style={styles.tableRow}>
            <Text style={[styles.td, { flex: 1.4 }]}>Total</Text>
            <Text style={[styles.td, { flex: 1 }]}>{formatAmount(byCat.total, userCurrency)}</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={[styles.td, { flex: 1.4 }]}>Daily average</Text>
            <Text style={[styles.td, { flex: 1 }]}>{formatAmount(avgDaily, userCurrency)}</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ===== Styles (tabs cloned from recordDaily.js) =====
const styles = StyleSheet.create({
  screen: { 
    flex: 1, 
    backgroundColor: "#070707ff" 
  },

  tabs: {
    flexDirection: "row",
    backgroundColor: "#151515",
    paddingTop: 30,
    paddingBottom: 10,
  },
  backArrow: {
    color: "#fff",
    width: 30, height: 30,
    marginTop: 3, marginHorizontal: 15
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

  // Range bar
  rangeRow: {
    backgroundColor: "#151515",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 8,
  },
  arrowBtn: { 
    paddingHorizontal: 12, 
    paddingVertical: 6 
    },
  rangeText: { 
    color: "#fff", 
    fontSize: 14 
  },

  // Cards
  card: {
    backgroundColor: "#151515",
    margin: 12,
    borderRadius: 12,
    padding: 12
  },
  cardHeader: {
    borderBottomWidth: 1,
    borderBottomColor: "#1f1f1f",
    paddingBottom: 8,
    marginBottom: 8,
  },
  cardHeaderText: { 
    color: "#eee", 
    fontWeight: "700" 
  },

  // Inside-card kind toggle
  kindTabs: {
    marginTop: 10,
    flexDirection: "row",
    alignSelf: "center",
    backgroundColor: "#1b1b1b",
    borderRadius: 8,
    overflow: "hidden",
  },
  kindBtn: { 
    paddingVertical: 6, 
    paddingHorizontal: 12 
  },
  kindBtnActive: { 
    backgroundColor: "#2b2b2b" 
  },
  kindText: { 
    color: "#bbb" 
  },
  kindTextActive: {
    color: "#fff", 
    fontWeight: "700" 
  },

  // Table
  summaryHeader: { 
    borderBottomColor: "#1f1f1f", 
    borderBottomWidth: 1, 
    paddingBottom: 8, 
    marginBottom: 8
  },
  tableHead: { 
    backgroundColor: "#101010" 
  },
  tableRow: { 
    flexDirection: "row",
    borderTopWidth: 1, 
    borderTopColor: "#232323", 
    paddingVertical: 8, 
    paddingHorizontal: 8 
  },
  th: { 
    color: "#ddd", 
    fontWeight: "700" 
  },
  td: { 
    color: "#ddd"
  },
});
