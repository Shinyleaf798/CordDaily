import { useMemo } from 'react';

import type { TransactionWithCategory } from '@/db/transactions';
import { useTransactionsInRange } from '@/hooks/use-transactions';
import type { CategorySlice } from '@/hooks/use-stats-view-data';
import {
  addDays,
  diffInDays,
  formatDayKey,
  formatMonthDay,
  formatMonthKey,
  formatWeekLabel,
  shiftMonth,
  shiftWeek,
  shiftYear,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  WEEKDAY_LABELS,
} from '@/utils/date';
import { groupTransactionsByDay, type TransactionDayGroup } from '@/utils/transaction-view';

/**
 * 账单预览页（首页右上角那个饼图进来）的全部派生。
 *
 * 这一页只有**一个**查询：把选中那一段的交易整批取回来，收支总览、趋势图、汇总表、
 * 分类、标签、明细全是从同一份数据算出来的。不为每块内容各写一条 SQL 聚合，理由有两条：
 *
 * 1. **口径只有一处**。几条聚合查询迟早会分叉——某一条忘了 `excludeFromStats = 0`，
 *    于是总览说花了 1200、分类加起来是 1230，而没人知道该信哪个。
 * 2. **时区**。按年/月/日分组在 SQL 里做就得切 ISO 字符串，那切出来的是 UTC
 *    （utils/date.ts 顶上那个坑）。在 JS 里用本地取值的方法分组，跟全 App 其它地方是同一套算法。
 *
 * 代价是「总」那一档会把整本账读进内存。本地账本的量级（几百到几千条）完全撑得住；
 * 真到了撑不住的那天，要换的是这一个函数的输入，不是六块内容的显示逻辑。
 */

/** 看的是哪一档时间粒度。跟界面上那排 总/年/月/周 一一对应 */
export type BillScope = 'all' | 'year' | 'month' | 'week';

export const BillScopeLabels: Record<BillScope, string> = {
  all: '总',
  year: '年',
  month: '月',
  week: '周',
};

/** 漏斗里选的收支筛选。`all` 时分类/标签按支出算（见 categoryType） */
export type BillTypeFilter = 'all' | 'EXPENSE' | 'INCOME';

export const BillTypeFilterLabels: Record<BillTypeFilter, string> = {
  all: '全部',
  EXPENSE: '只看支出',
  INCOME: '只看收入',
};

/** 趋势图画的是哪条线 */
export type BillTrendMetric = 'expense' | 'income' | 'balance';

export const BillTrendMetricLabels: Record<BillTrendMetric, string> = {
  expense: '支出',
  income: '收入',
  balance: '结余',
};

/**
 * 「正在看哪一段」。
 *
 * anchor 是那一段的**起点**（某年 1 月 1 日 / 某月 1 号 / 某周的周一），`all` 那一档忽略它。
 * 存起点而不是存「2026年9月」这样一个字符串：翻页是 `shiftMonth(anchor, -1)` 这种纯计算，
 * 而字符串得先解析回来才能加减，多一次解析就多一个解析失败的分支。
 */
export type BillPeriod = { scope: BillScope; anchor: Date };

/** 汇总表里的一行 */
export type BillSummaryRow = {
  key: string;
  label: string;
  income: number;
  expense: number;
  balance: number;
  /** 「总计」和「年均/月均/日均」这两行：它们是对下面那些行的概括，界面上要跟明细行分开 */
  isSummary: boolean;
};

/** 趋势图上的一个点。三条线共用同一批点，切换指标时横轴一格都不动 */
export type BillTrendPoint = {
  key: string;
  /** 横轴上那行小字：1月 / 15 / 周三 / 2026 */
  label: string;
  expense: number;
  income: number;
  balance: number;
};

/** 分类统计的一行：顶层分类 + 它底下的子分类。点开才画子分类 */
export type CategoryStatGroup = CategorySlice & { children: CategorySlice[] };

/** 标签统计的一行。跟分类正交的第二个维度，只是这里限定在选中的那一段时间里 */
export type BillTagStat = {
  tag: string;
  total: number;
  count: number;
  /** 占这一段同类型总额的百分比 */
  percentage: number;
  /** 相对第一名的长度，0-100。条的宽度用它 */
  relative: number;
};

export type BillOverviewData = {
  /** 全部账单 / 2026年 / 2026年9月 / 9月22日 - 9月28日。标题行正中间那句话 */
  periodLabel: string;
  /** 汇总表那张卡的标题：总账单汇总 / 年账单汇总 / 月账单汇总 / 周账单汇总 */
  tableTitle: string;
  /** 「总」那一档没有前后可翻，界面把翻页箭头收掉 */
  canStep: boolean;
  /** 看的是不是当下这一段（本年/本月/本周）。不是的话给一个「回到现在」的退路 */
  isCurrent: boolean;

  expense: number;
  income: number;
  balance: number;
  /** 计入统计的笔数。跟下面明细的行数不一定相等，见 buildBillOverviewData 里的口径说明 */
  count: number;
  dailyExpense: number;
  perEntryExpense: number;
  /** 垫出去还没收回的钱 / 已经收回来的钱，都限定在这一段时间里 */
  pendingReimbursement: number;
  settledReimbursement: number;

  trend: BillTrendPoint[];
  rows: BillSummaryRow[];

  /** 分类统计。按 categoryType 过滤过了 */
  categories: CategoryStatGroup[];
  tags: BillTagStat[];
  /** 分类和标签这两块算的是支出还是收入。漏斗选「全部」时是支出 */
  categoryType: 'EXPENSE' | 'INCOME';

  /** 明细。按漏斗里的收支筛选过滤过了 */
  dayGroups: TransactionDayGroup[];
};

// ---- 时间段：起止、标题、翻页 ----

/** 这一段的起止。两头都可以是 null，表示"这一头不设限"（「总」那一档两头都是 null） */
export function billPeriodRange(period: BillPeriod): { start: Date | null; end: Date | null } {
  switch (period.scope) {
    case 'all':
      return { start: null, end: null };
    case 'year':
      return { start: period.anchor, end: shiftYear(period.anchor, 1) };
    case 'month':
      return { start: period.anchor, end: shiftMonth(period.anchor, 1) };
    case 'week':
      return { start: period.anchor, end: addDays(period.anchor, 7) };
  }
}

/**
 * 标题行正中间那句话。
 *
 * 「总」那一档写的是**全部账单**，不是「全部」：这一行在那一档里同时担着页面标题的职责
 * （顶上那排 总/年/月/周 是控件不是标题，导航栏又整条关掉了），
 * 光写「全部」会让这一页看起来没有名字。
 */
export function billPeriodLabel(period: BillPeriod): string {
  switch (period.scope) {
    case 'all':
      return '全部账单';
    case 'year':
      return `${period.anchor.getFullYear()}年`;
    case 'month':
      return `${period.anchor.getFullYear()}年${period.anchor.getMonth() + 1}月`;
    case 'week':
      // 一周没有名字，只能报首尾两天
      return formatWeekLabel(period.anchor);
  }
}

/** 往前（负）或往后（正）翻一段。「总」那一档翻不动，原样返回 */
export function shiftBillPeriod(period: BillPeriod, delta: number): BillPeriod {
  switch (period.scope) {
    case 'all':
      return period;
    case 'year':
      return { scope: 'year', anchor: shiftYear(period.anchor, delta) };
    case 'month':
      return { scope: 'month', anchor: shiftMonth(period.anchor, delta) };
    case 'week':
      return { scope: 'week', anchor: shiftWeek(period.anchor, delta) };
  }
}

/**
 * 切换粒度时锚点落在哪。
 *
 * 一律回到**当下**那一段（本年 / 本月 / 本周），不试图去"保留"用户正在看的位置。
 * 保留听起来体贴，实际答不上来：从「2024年」切到「周」，该落在 2024 年的哪一周？
 * 任何一个答案都是编的，而用户切粒度时想问的通常是"那换成按周看呢"——问的是现在。
 */
export function billPeriodForScope(scope: BillScope, now: Date): BillPeriod {
  switch (scope) {
    case 'all':
      return { scope, anchor: startOfDay(now) };
    case 'year':
      return { scope, anchor: startOfYear(now) };
    case 'month':
      return { scope, anchor: startOfMonth(now) };
    case 'week':
      return { scope, anchor: startOfWeek(now) };
  }
}

function isCurrentPeriod(period: BillPeriod, now: Date): boolean {
  if (period.scope === 'all') return true;
  return period.anchor.getTime() === billPeriodForScope(period.scope, now).anchor.getTime();
}

// ---- 分桶：汇总表的明细行和趋势图的点共用同一套粒度 ----

type Granularity = 'year' | 'month' | 'day';

/**
 * 每一档看的是哪个粒度的明细。
 *
 * 规律是"降一级"：看整本账就按年列，看一年就按月列，看一个月或一周就按天列。
 * 同级列自己（看 9 月却按月列）只会得到一行，那一行跟上面的总计一字不差。
 */
function granularityOf(scope: BillScope): Granularity {
  if (scope === 'all') return 'year';
  if (scope === 'year') return 'month';
  return 'day';
}

const TableTitles: Record<BillScope, string> = {
  all: '总账单汇总',
  year: '年账单汇总',
  month: '月账单汇总',
  week: '周账单汇总',
};

/** 均值行怎么叫。粒度是年就叫年均，以此类推 */
const AverageLabels: Record<Granularity, string> = { year: '年均', month: '月均', day: '日均' };

function bucketKey(date: Date, granularity: Granularity): string {
  if (granularity === 'year') return String(date.getFullYear());
  if (granularity === 'month') return formatMonthKey(date);
  return formatDayKey(date);
}

/** 汇总表里那一列的写法。比横轴上的长，因为那里一行只放一个 */
function rowLabel(date: Date, granularity: Granularity): string {
  if (granularity === 'year') return `${date.getFullYear()}年`;
  if (granularity === 'month') return `${date.getMonth() + 1}月`;
  return `${formatMonthDay(date)} ${WEEKDAY_LABELS[date.getDay()]}`;
}

/**
 * 趋势图横轴上那行小字。比表格里的短——一屏要横着排下十几个，
 * 「9月13日 周三」那种写法挤在一起谁也读不了。
 *
 * 按周看时用星期而不是日期：一周七格，人想知道的是"周末花得多不多"，
 * 那个问题的答案在星期几上，不在 22 号还是 23 号上。
 */
function trendLabel(date: Date, granularity: Granularity, scope: BillScope): string {
  if (granularity === 'year') return String(date.getFullYear());
  if (granularity === 'month') return `${date.getMonth() + 1}月`;
  if (scope === 'week') return WEEKDAY_LABELS[date.getDay()];
  return String(date.getDate());
}

/**
 * 趋势图横轴上那**整排**格子——注意跟汇总表不同，这里是**整段铺满**的，
 * 没账的那一格也要在（高度 0）。
 *
 * 理由：折线图读的是形状。七月和九月有账、八月没有的话，把八月抽掉会让两个点直接连起来，
 * 看起来像是连续两个月——那是假的。而汇总表读的是数字，列一行「8月 0.00」只是噪音，
 * 所以那边只列有账的段。两块内容对"要不要空位"的答案不一样，是因为它们回答的问题不一样。
 */
function trendSpan(period: BillPeriod, now: Date, earliest: Date | null): Date[] {
  switch (period.scope) {
    case 'all': {
      // 从最早那笔账所在的年份铺到今年。一笔都没有就没有横轴可画
      if (!earliest) return [];
      const from = earliest.getFullYear();
      const to = Math.max(now.getFullYear(), from);
      return Array.from({ length: to - from + 1 }, (_, i) => new Date(from + i, 0, 1));
    }
    case 'year':
      // 12 个月整年铺满，哪怕只记了三个月——一年的形状本来就是十二格
      return Array.from({ length: 12 }, (_, i) => new Date(period.anchor.getFullYear(), i, 1));
    case 'month': {
      const days = new Date(period.anchor.getFullYear(), period.anchor.getMonth() + 1, 0).getDate();
      return Array.from({ length: days }, (_, i) => addDays(period.anchor, i));
    }
    case 'week':
      return Array.from({ length: 7 }, (_, i) => addDays(period.anchor, i));
  }
}

/**
 * 这一段**已经过去**多少天。日均的分母用它，不用整段的天数。
 *
 * 理由：9 月 3 号看「本月」，整月 30 天，用 30 当分母会把日均算成实际的十分之一，
 * 而那个数会被读成"我每天只花这么点"。首页的日均消费从一开始就是按已过天数算的
 * （见 buildHomeViewData），这里跟它对齐。
 *
 * 「总」那一档没有起点，用**最早那笔账**当起点——账本是从第一笔开始的，不是从 1970 年。
 */
function elapsedDays(start: Date | null, end: Date | null, earliest: Date | null, now: Date): number {
  const from = start ?? earliest;
  if (!from) return 1;
  // 段还没走完就算到今天为止；已经走完的段算到它自己的最后一天
  const lastDay = end ? addDays(end, -1) : startOfDay(now);
  const until = lastDay.getTime() < startOfDay(now).getTime() ? lastDay : startOfDay(now);
  return Math.max(diffInDays(until, startOfDay(from)) + 1, 1);
}

/**
 * 账单预览页的全部派生。纯函数，不碰 React——跟 buildHomeViewData / buildStatsViewData 同一个路子。
 *
 * **口径**（这一页最容易被问的一件事）：
 * 上面的收支总览、趋势图、汇总表、分类、标签**跳过** `excludeFromStats` 的那几笔，
 * 跟预算和统计页一致；下面的明细列表**不跳过**，它列的是流水。
 * 所以「帮人垫付」那种账会出现在列表里但不进合计——这是全 App 一直以来的处理
 * （「账单是流水，统计是口径」），不是这一页特有的。
 */
export function buildBillOverviewData(input: {
  now: Date;
  period: BillPeriod;
  /** 漏斗里选的收支筛选 */
  typeFilter: BillTypeFilter;
  /** 汇总表的明细行是不是按时间正序（旧→新）。默认倒序 */
  sortAscending: boolean;
  transactions?: TransactionWithCategory[];
}): BillOverviewData {
  const { now, period, typeFilter, sortAscending, transactions } = input;
  const rows = transactions ?? [];
  const counted = rows.filter((t) => !t.excludeFromStats);

  const expense = counted.filter((t) => t.type === 'EXPENSE').reduce((sum, t) => sum + t.amountInBase, 0);
  const income = counted.filter((t) => t.type === 'INCOME').reduce((sum, t) => sum + t.amountInBase, 0);

  // 报销那两个数不跳过 excludeFromStats：「帮人垫付」这类账**通常正好**是被标成不计入统计的
  // （录入界面上勾了报销就默认不计入），跳过它们等于把这两个数永远显示成 0
  const reimbursable = rows.filter((t) => t.isReimbursable);
  const pendingReimbursement = reimbursable
    .filter((t) => !t.reimbursedAt)
    .reduce((sum, t) => sum + t.amountInBase, 0);
  const settledReimbursement = reimbursable
    .filter((t) => t.reimbursedAt)
    .reduce((sum, t) => sum + t.amountInBase, 0);

  // ---- 分桶：汇总表和趋势图共用这一份 ----
  const granularity = granularityOf(period.scope);
  const buckets = new Map<string, { label: string; income: number; expense: number }>();

  for (const t of counted) {
    const date = new Date(t.date);
    const key = bucketKey(date, granularity);
    const bucket = buckets.get(key) ?? { label: rowLabel(date, granularity), income: 0, expense: 0 };
    if (t.type === 'INCOME') bucket.income += t.amountInBase;
    else bucket.expense += t.amountInBase;
    buckets.set(key, bucket);
  }

  // key 是 '2026' / '2026-09' / '2026-09-13' 这种定宽写法，直接比字符串大小就是比时间先后
  const detailRows: BillSummaryRow[] = [...buckets.entries()]
    .sort((a, b) => (sortAscending ? a[0].localeCompare(b[0]) : b[0].localeCompare(a[0])))
    .map(([key, bucket]) => ({
      key,
      label: bucket.label,
      income: bucket.income,
      expense: bucket.expense,
      balance: bucket.income - bucket.expense,
      isSummary: false,
    }));

  const summaryRows: BillSummaryRow[] = [
    { key: '__total__', label: '总计', income, expense, balance: income - expense, isSummary: true },
  ];

  // 均值的分母是**有账的那几段**，不是日历上的段数：
  // 2024 年到 2026 年之间某一年一笔没记的话，把它算进分母会让年均莫名其妙地变小，
  // 而那一年本来就不该参与"平均每年花多少"这个问题
  if (detailRows.length > 1) {
    const n = detailRows.length;
    summaryRows.push({
      key: '__average__',
      label: AverageLabels[granularity],
      income: income / n,
      expense: expense / n,
      balance: (income - expense) / n,
      isSummary: true,
    });
  }

  // ---- 趋势图：整段铺满，没账的格子留在那儿（见 trendSpan 的说明）----
  const earliest = rows.length > 0 ? new Date(rows[rows.length - 1].date) : null;
  const trend: BillTrendPoint[] = trendSpan(period, now, earliest).map((date) => {
    const bucket = buckets.get(bucketKey(date, granularity));
    const pointExpense = bucket?.expense ?? 0;
    const pointIncome = bucket?.income ?? 0;
    return {
      key: bucketKey(date, granularity),
      label: trendLabel(date, granularity, period.scope),
      expense: pointExpense,
      income: pointIncome,
      balance: pointIncome - pointExpense,
    };
  });

  // ---- 分类和标签 ----
  //
  // 漏斗选「全部」时这两块按**支出**算。不是偷懒：一个把收入和支出加在一起的分类构成图
  // 回答不了任何问题——「餐饮 486 + 工资 3000」摆在同一根轴上，那根轴没有含义。
  // 界面上因此写明了「支出构成」还是「收入构成」，不让这个选择悄悄发生。
  const categoryType: 'EXPENSE' | 'INCOME' = typeFilter === 'INCOME' ? 'INCOME' : 'EXPENSE';
  const typed = counted.filter((t) => t.type === categoryType);

  type Roll = { id: string; name: string; icon: string | null; total: number; count: number };
  const parents = new Map<string, Roll & { children: Map<string, Roll> }>();

  for (const t of typed) {
    const parentId = t.categoryParentId ?? t.categoryId;
    const parentName = t.categoryParentId ? (t.categoryParentName ?? '未分类') : (t.categoryName ?? '未分类');
    const parentIcon = t.categoryParentId ? t.categoryParentIcon : t.categoryIcon;

    const parent = parents.get(parentId) ?? {
      id: parentId,
      name: parentName,
      icon: parentIcon,
      total: 0,
      count: 0,
      children: new Map<string, Roll>(),
    };
    parent.total += t.amountInBase;
    parent.count += 1;

    // 只有真的挂在子分类下面的账才进 children。直接选了顶层分类的那些账留在父身上，
    // 不给它们编一个「其他」子项——那会让子分类的加总跟父分类对不上时更难查
    if (t.categoryParentId) {
      const child = parent.children.get(t.categoryId) ?? {
        id: t.categoryId,
        name: t.categoryName ?? '未分类',
        icon: t.categoryIcon,
        total: 0,
        count: 0,
      };
      child.total += t.amountInBase;
      child.count += 1;
      parent.children.set(t.categoryId, child);
    }

    parents.set(parentId, parent);
  }

  const sortedParents = [...parents.values()].sort((a, b) => b.total - a.total);
  const typeTotal = sortedParents.reduce((sum, entry) => sum + entry.total, 0);
  // 条的长度按「相对第一名」算，不按「占总支出」算——理由同 buildStatsViewData：
  // 构成图要读的是"谁比谁多多少"，那个信息在相对长度里
  const longest = sortedParents[0]?.total ?? 0;

  const categories: CategoryStatGroup[] = sortedParents.map((parent) => {
    const children = [...parent.children.values()].sort((a, b) => b.total - a.total);
    const longestChild = children[0]?.total ?? 0;

    return {
      id: parent.id,
      name: parent.name,
      icon: parent.icon,
      total: parent.total,
      percentage: typeTotal > 0 ? (parent.total / typeTotal) * 100 : 0,
      relative: longest > 0 ? (parent.total / longest) * 100 : 0,
      count: parent.count,
      isOther: false,
      children: children.map((child) => ({
        id: child.id,
        name: child.name,
        icon: child.icon,
        total: child.total,
        // 子分类的百分比是「占这个父分类」，不是「占全部支出」——
        // 展开之后的参照系就该是父分类，不然几个子项加起来不是 100%，没法读（同分类下钻页）
        percentage: parent.total > 0 ? (child.total / parent.total) * 100 : 0,
        relative: longestChild > 0 ? (child.total / longestChild) * 100 : 0,
        count: child.count,
        isOther: false,
      })),
    };
  });

  // 标签：跟统计页那张全时间的标签汇总不同，这里**限定在选中的那一段**里。
  // 「槟城旅行」那种跨月的标签在这一页照样切得开，因为这一页的主语本来就是"这一段时间"
  const tagTotals = new Map<string, { total: number; count: number }>();
  for (const t of typed) {
    for (const tag of t.tags) {
      const entry = tagTotals.get(tag) ?? { total: 0, count: 0 };
      entry.total += t.amountInBase;
      entry.count += 1;
      tagTotals.set(tag, entry);
    }
  }

  const sortedTags = [...tagTotals.entries()].sort((a, b) => b[1].total - a[1].total);
  const longestTag = sortedTags[0]?.[1].total ?? 0;
  const tags: BillTagStat[] = sortedTags.map(([tag, entry]) => ({
    tag,
    total: entry.total,
    count: entry.count,
    percentage: typeTotal > 0 ? (entry.total / typeTotal) * 100 : 0,
    relative: longestTag > 0 ? (entry.total / longestTag) * 100 : 0,
  }));

  // ---- 日均 / 笔均 / 明细 ----
  const { start, end } = billPeriodRange(period);
  const days = elapsedDays(start, end, earliest, now);
  const countedCount = counted.length;

  // 明细跟着漏斗走。用 rows 不用 counted：列表是流水，「不计入统计」的那几笔也该在
  const listed = typeFilter === 'all' ? rows : rows.filter((t) => t.type === typeFilter);

  return {
    periodLabel: billPeriodLabel(period),
    tableTitle: TableTitles[period.scope],
    canStep: period.scope !== 'all',
    isCurrent: isCurrentPeriod(period, now),
    expense,
    income,
    balance: income - expense,
    count: countedCount,
    dailyExpense: expense / days,
    perEntryExpense: countedCount > 0 ? expense / countedCount : 0,
    pendingReimbursement,
    settledReimbursement,
    trend,
    rows: [...summaryRows, ...detailRows],
    categories,
    tags,
    categoryType,
    dayGroups: groupTransactionsByDay(listed, now),
  };
}

/**
 * 账单预览页取数：一个查询 + 一次派生。
 *
 * 换粒度、翻页时变的是 period，查询的 key 跟着起止时间走，看过的段直接命中缓存。
 * 切收支筛选、换排序、换趋势指标都**不重新打库**——那些只是对同一份数据换个算法。
 *
 * 派生**必须**缓存住。「总」那一档手里是整本账，而这一页除了明细还有四块全量聚合
 * （总览卡、趋势图、分类构成、标签榜）——它们要的就是全部行，没法靠少列几条明细省掉。
 * 不缓存的话，开一次详情层、切一次分页、点一下漏斗，都会把几千行重新排序、分组、聚合一遍：
 * 这一页真正会让人等的是这个，不是列表滚动（列表是 FlatList，本来就只渲染看得见的那几屏）。
 */
export function useBillOverviewData(
  period: BillPeriod,
  typeFilter: BillTypeFilter,
  sortAscending: boolean,
): BillOverviewData {
  const { start, end } = billPeriodRange(period);
  const { data: transactions } = useTransactionsInRange(start, end);

  // 依赖里放的是"今天是哪天"，不是"此刻几点"。派生里每一处用到 now 的地方
  // （今天/昨天的标签、看的是不是本月、日均的分母、趋势图的年份上界）都只看到日期那一级，
  // 所以同一天内重算出来的东西是一样的，缓存住不会看到过期的结果。
  // App 挂在后台跨过零点再回来，这个数变了 memo 自然失效——原来那句"每次渲染重新取现在"
  // 要保的就是这个行为，用日期当 key 一样保得住（同 useHomeViewData / useStatsViewData）。
  const today = startOfDay(new Date()).getTime();

  return useMemo(
    () => buildBillOverviewData({ now: new Date(today), period, typeFilter, sortAscending, transactions }),
    [today, period, typeFilter, sortAscending, transactions],
  );
}
