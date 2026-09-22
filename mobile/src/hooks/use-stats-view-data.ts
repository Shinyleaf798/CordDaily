import type { TransactionListItemData } from '@/components/transaction/transaction-list-item';
import type { CategorySpending, MonthSummary, TagSummary, TransactionWithCategory } from '@/db/transactions';
import {
  useCategorySpending,
  useCategoryTransactions,
  useMonthSummary,
  usePendingReimbursementTotal,
  useTagSummaries,
} from '@/hooks/use-transactions';
import { formatClockTime, formatDayGroupLabel, shiftMonth, startOfDay, startOfMonth } from '@/utils/date';
import { formatCategoryPath } from '@/utils/format';

/** 主屏构成图最多列几行，超出的并进「其他」 */
const TOP_CATEGORY_COUNT = 5;
/** 主屏标签区最多列几行 */
const TOP_TAG_COUNT = 3;

export type CategorySlice = {
  /** 「其他」那一行没有真实分类，id 是 `__other__`，点不进去 */
  id: string;
  name: string;
  icon: string | null;
  total: number;
  /** 占本月支出的百分比，0-100 */
  percentage: number;
  /** 相对第一名的长度，0-100。条的宽度用它，不用 percentage */
  relative: number;
  count: number;
  isOther: boolean;
};

export type StatsViewData = {
  monthLabel: string;
  /** 当前看的是不是本月。不是的话界面上给一个「回到本月」的退路 */
  isCurrentMonth: boolean;
  expense: number;
  income: number;

  /** 上月支出。没有上月数据时是 0 */
  previousExpense: number;
  /** 本月比上月多花（正）/ 少花（负）多少钱 */
  deltaAmount: number;
  /** 环比百分比。上月是 0 时给 null——除以 0 得不出有意义的比例 */
  deltaPercentage: number | null;

  categories: CategorySlice[];
  /** 折叠进「其他」之前一共有几个分类，用来决定要不要显示「全部 ›」 */
  categoryCount: number;

  tags: TagSummary[];
  tagCount: number;

  pendingReimbursement: number;
};

const OTHER_ID = '__other__';

/**
 * 统计页所有派生数字都算在这里，组件只负责画——跟 buildHomeViewData 同一个路子。
 *
 * 抽成纯函数（不碰 React）是为了留一个可测入口：
 * 「子分类的钱卷到父分类头上」和「前五名之外并成其他」这两条规则都是纯计算，
 * 以后补测试测这个函数就够了，不用渲染组件。
 */
export function buildStatsViewData(input: {
  now: Date;
  /** 正在看的月份（1 号）。翻月时变的是它，now 始终是真实的现在 */
  month: Date;
  summary?: MonthSummary;
  previousSummary?: MonthSummary;
  spending?: CategorySpending[];
  tags?: TagSummary[];
  pendingReimbursement?: number;
}): StatsViewData {
  const { now, month, summary, previousSummary, spending, tags, pendingReimbursement } = input;

  const expense = summary?.expense ?? 0;
  const previousExpense = previousSummary?.expense ?? 0;
  const deltaAmount = expense - previousExpense;

  // 上月一笔没记时不给百分比：除以 0 要么是 Infinity 要么得编一个数，
  // 界面上宁可只显示「比上月 +132.60」这个绝对值
  const deltaPercentage = previousExpense > 0 ? (deltaAmount / previousExpense) * 100 : null;

  // 子分类的钱卷到顶层分类头上。查询给的是叶子分类，主屏要看的是顶层。
  // 合并放在这里而不是 SQL 里：同一份数据还要喂下钻页（那里要的正是没卷起来的叶子）
  const rolled = new Map<string, { id: string; name: string; icon: string | null; total: number; count: number }>();
  for (const row of spending ?? []) {
    const id = row.parentId ?? row.categoryId;
    const name = row.parentId ? (row.parentName ?? '未分类') : (row.name ?? '未分类');
    const icon = row.parentId ? row.parentIcon : row.icon;

    const entry = rolled.get(id) ?? { id, name, icon, total: 0, count: 0 };
    entry.total += row.total;
    entry.count += row.count;
    rolled.set(id, entry);
  }

  const sorted = [...rolled.values()].sort((a, b) => b.total - a.total);
  const top = sorted.slice(0, TOP_CATEGORY_COUNT);
  const rest = sorted.slice(TOP_CATEGORY_COUNT);

  // 条的长度按「相对第一名」算，不按「占总支出的百分比」算。
  // 后者会让第一名只占 30% 时整张图的条全都很短，看不出彼此的差距——
  // 构成图要读的是"谁比谁多多少"，那个信息在相对长度里，不在绝对占比里。
  // 占比另外用右边的百分比文字交代。
  const longest = top[0]?.total ?? 0;
  const toSlice = (entry: (typeof sorted)[number], isOther: boolean): CategorySlice => ({
    id: entry.id,
    name: entry.name,
    icon: entry.icon,
    total: entry.total,
    percentage: expense > 0 ? (entry.total / expense) * 100 : 0,
    relative: longest > 0 ? (entry.total / longest) * 100 : 0,
    count: entry.count,
    isOther,
  });

  const categories = top.map((entry) => toSlice(entry, false));
  if (rest.length > 0) {
    categories.push(
      toSlice(
        {
          id: OTHER_ID,
          name: `其他 ${rest.length} 项`,
          icon: null,
          total: rest.reduce((sum, entry) => sum + entry.total, 0),
          count: rest.reduce((sum, entry) => sum + entry.count, 0),
        },
        true,
      ),
    );
  }

  const allTags = tags ?? [];

  return {
    monthLabel: `${month.getFullYear()}年${month.getMonth() + 1}月`,
    isCurrentMonth: month.getTime() === startOfMonth(now).getTime(),
    expense,
    income: summary?.income ?? 0,
    previousExpense,
    deltaAmount,
    deltaPercentage,
    categories,
    categoryCount: sorted.length,
    tags: allTags.slice(0, TOP_TAG_COUNT),
    tagCount: allTags.length,
    pendingReimbursement: pendingReimbursement ?? 0,
  };
}

/**
 * 统计页取数的唯一入口：四个查询 + 一次派生。
 *
 * 口径上有一处**故意**的不一致：标签汇总是全部时间的，其余三个都是本月的。
 * 「槟城旅行」「装修」这类标签圈的是一件横跨几个月的事，切成「9 月那部分」没有意义。
 * 所以页面上那一区的标题写明了「全部时间」，把这个差别摆在明处而不是让它悄悄存在。
 */
export function useStatsViewData(month: Date): StatsViewData {
  // 每次渲染重新取"现在"，不用 useMemo：App 挂在后台跨过月底再回来，
  // "看的是不是本月"这个判断得跟着变（同 useHomeViewData 的理由）
  const now = new Date();
  const previousMonth = shiftMonth(month, -1);

  const { data: summary } = useMonthSummary(month);
  const { data: previousSummary } = useMonthSummary(previousMonth);
  const { data: spending } = useCategorySpending(month);
  const { data: tags } = useTagSummaries();
  const { data: pendingReimbursement } = usePendingReimbursementTotal();

  return buildStatsViewData({ now, month, summary, previousSummary, spending, tags, pendingReimbursement });
}

// ---- 分类下钻：点主屏构成图里的一行进来 ----

export type CategoryDetailTransaction = TransactionListItemData & { date: Date };

export type CategoryDetailDayGroup = {
  key: string;
  date: Date;
  label: string;
  subLabel: string;
  items: CategoryDetailTransaction[];
  expense: number;
  income: number;
};

export type CategoryDetailViewData = {
  monthLabel: string;
  isCurrentMonth: boolean;
  /** 分类名。数据还没回来时是空串，界面上用页面标题兜着 */
  name: string;
  icon: string | null;
  /** 这个分类（含子分类）本月的支出合计 */
  total: number;
  /** 占本月全部支出的百分比 */
  percentage: number;
  count: number;
  /** 子分类构成。这个分类没有子分类时是空数组，界面上整段不画 */
  children: CategorySlice[];
  dayGroups: CategoryDetailDayGroup[];
};

/**
 * 分类下钻页的派生。跟 buildStatsViewData 共用 CategorySlice 和它那套长度规则——
 * 主屏的「餐饮 / 日用 / 交通」和这里的「外卖 / 早餐 / 聚餐」是同一种图，只是层级不同，
 * 两边算法一致，切换上下层时条的读法不会突然变一套。
 *
 * 口径跟主屏对齐：**合计和构成跳过 excludeFromStats**（数字来自 listCategorySpending），
 * **下面的明细列表不跳过**（来自 listCategoryTransactions）。
 * 所以「帮人垫付」那种账会出现在列表里但不进上面那个合计——这跟首页"账单是流水、统计是口径"
 * 的处理是同一条规矩，不是这里特有的。
 */
export function buildCategoryDetailViewData(input: {
  now: Date;
  month: Date;
  categoryId: string;
  /** 整月的分类聚合，跟主屏共用同一份缓存，不另外查一次 */
  spending?: CategorySpending[];
  transactions?: TransactionWithCategory[];
}): CategoryDetailViewData {
  const { now, month, categoryId, spending, transactions } = input;

  const rows = spending ?? [];
  // 属于这个分类的聚合行：它自己（没选子分类的那些账）+ 它的所有子分类
  const own = rows.filter((row) => row.categoryId === categoryId || row.parentId === categoryId);
  const total = own.reduce((sum, row) => sum + row.total, 0);
  const count = own.reduce((sum, row) => sum + row.count, 0);
  const monthExpense = rows.reduce((sum, row) => sum + row.total, 0);

  // 名字和图标从聚合行里取：这个月有账，行就一定在。
  // 一笔都没有时退回空串，由页面标题兜底（那里的名字来自路由参数）
  const self = own.find((row) => row.categoryId === categoryId);
  const viaChild = own.find((row) => row.parentId === categoryId);
  const name = self?.name ?? viaChild?.parentName ?? '';
  const icon = self?.icon ?? viaChild?.parentIcon ?? null;

  const childRows = own.filter((row) => row.parentId === categoryId);
  const sortedChildren = [...childRows].sort((a, b) => b.total - a.total);
  const longest = sortedChildren[0]?.total ?? 0;

  const children: CategorySlice[] = sortedChildren.map((row) => ({
    id: row.categoryId,
    name: row.name ?? '未分类',
    icon: row.icon,
    total: row.total,
    // 这里的百分比是「占这个分类」，不是「占本月全部支出」——
    // 下钻之后的参照系就该是父分类，不然三个子分类的百分比加起来不是 100%，没法读
    percentage: total > 0 ? (row.total / total) * 100 : 0,
    relative: longest > 0 ? (row.total / longest) * 100 : 0,
    count: row.count,
    isOther: false,
  }));

  const items: CategoryDetailTransaction[] = (transactions ?? []).map((t) => ({
    id: t.id,
    date: new Date(t.date),
    icon: t.categoryIcon,
    title: t.title,
    categoryLabel: formatCategoryPath(t.categoryParentName, t.categoryName),
    time: formatClockTime(new Date(t.date)),
    note: t.remarks ?? undefined,
    amount: t.amount,
    type: t.type,
  }));

  const groups = new Map<string, CategoryDetailTransaction[]>();
  for (const item of items) {
    const key = startOfDay(item.date).toISOString();
    const existing = groups.get(key);
    if (existing) existing.push(item);
    else groups.set(key, [item]);
  }

  const dayGroups: CategoryDetailDayGroup[] = [...groups.entries()]
    .map(([key, groupItems]) => ({
      key,
      date: groupItems[0].date,
      ...formatDayGroupLabel(groupItems[0].date, now),
      items: groupItems,
      expense: groupItems.filter((t) => t.type === 'EXPENSE').reduce((sum, t) => sum + t.amount, 0),
      income: groupItems.filter((t) => t.type === 'INCOME').reduce((sum, t) => sum + t.amount, 0),
    }))
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  return {
    monthLabel: `${month.getFullYear()}年${month.getMonth() + 1}月`,
    isCurrentMonth: month.getTime() === startOfMonth(now).getTime(),
    name,
    icon,
    total,
    percentage: monthExpense > 0 ? (total / monthExpense) * 100 : 0,
    count,
    children,
    dayGroups,
  };
}

/**
 * 分类下钻页取数：两个查询。
 *
 * 分类聚合走的是跟主屏**同一个** queryKey（`['categorySpending', 月份]`），
 * 所以从主屏点进来时它已经在缓存里，进页面不会再打一次库，上面那个合计也是立刻就有的。
 */
export function useCategoryDetailViewData(categoryId: string, month: Date): CategoryDetailViewData {
  const now = new Date();
  const { data: spending } = useCategorySpending(month);
  const { data: transactions } = useCategoryTransactions(categoryId, month);

  return buildCategoryDetailViewData({ now, month, categoryId, spending, transactions });
}
