import type { TransactionListItemData } from '@/components/transaction/transaction-list-item';
import type { TransactionWithCategory } from '@/db/transactions';
import { formatClockTime, formatDayGroupLabel, formatMonthKey, formatYearMonth, startOfDay } from '@/utils/date';
import { formatCategoryPath } from '@/utils/format';

/**
 * 「库里的一条交易」→「列表里的一行」→「按天分好的几堆」这两步转换。
 *
 * 原来首页和分类下钻页各写了一遍，一字不差；搜索页和账单预览页要的是同一个东西，
 * 再抄两遍就是四份要同步维护的映射。抽出来的真正理由不是行数，是**一致性**：
 * 哪个字段当主题、时间写成什么样、一天的小计算不算收入，这些答案在四个页面上必须是同一个，
 * 否则同一笔账在搜索结果里和在首页上会长得不一样，而那种差别没人查得出来是从哪冒出来的。
 *
 * 放 utils/ 而不是 hooks/：它不碰 React，给定输入永远给出同样的输出。
 * 引一个组件的**类型**（TransactionListItemData）不破坏这一点——那是一份形状约定，不是依赖。
 */

export type DatedTransaction = TransactionListItemData & { date: Date };

export type TransactionDayGroup = {
  key: string;
  date: Date;
  /** 主标签：今天 / 昨天 / 9月13日 */
  label: string;
  /** 副标签：主标签是相对说法时补具体日期，否则补星期 */
  subLabel: string;
  items: DatedTransaction[];
  expense: number;
  income: number;
};

export type TransactionMonthGroup = {
  /** `2026-08`。走 formatMonthKey，不是 toISOString 切片（东八区会错一天，见 utils/date.ts 顶上） */
  key: string;
  /** 这堆里最新的那笔的时间。排序和取年月都用它 */
  date: Date;
  /** 给人看的标题：`2026年8月` */
  label: string;
  items: DatedTransaction[];
  expense: number;
  income: number;
};

/** 一条交易 → 一行列表项。icon 原样传，三种写法（emoji / builtin: / file:）怎么渲染由 CategoryIcon 回答 */
export function toDatedTransaction(t: TransactionWithCategory): DatedTransaction {
  const date = new Date(t.date);
  return {
    id: t.id,
    date,
    icon: t.categoryIcon,
    title: t.title,
    categoryLabel: formatCategoryPath(t.categoryParentName, t.categoryName),
    time: formatClockTime(date),
    note: t.remarks ?? undefined,
    amount: t.amount,
    currency: t.currency,
    amountInBase: t.amountInBase,
    type: t.type,
  };
}

/**
 * 按天归堆，新的一天在最前面。
 *
 * 每天的小计**不跳过 excludeFromStats**：这里算的是"这一天的流水"，跟卡片里列出来的行一一对应。
 * 「不计入统计」影响的是预算和统计页那些口径数字，不是一天的账面。
 * 首页从一开始就是这么处理的（见 use-home-view-data 里那句"账单是流水，统计是口径"），
 * 抽出来之后这条规矩才真正只有一处定义。
 */
export function groupTransactionsByDay(
  transactions: TransactionWithCategory[] | undefined,
  now: Date,
): TransactionDayGroup[] {
  const groups = new Map<string, DatedTransaction[]>();

  for (const t of transactions ?? []) {
    const item = toDatedTransaction(t);
    // key 走 startOfDay 而不是切 ISO 字符串：后者切出来的是 UTC 日期（utils/date.ts 顶上那个坑）
    const key = startOfDay(item.date).toISOString();
    const existing = groups.get(key);
    if (existing) existing.push(item);
    else groups.set(key, [item]);
  }

  return [...groups.entries()]
    .map(([key, items]) => ({
      key,
      date: items[0].date,
      ...formatDayGroupLabel(items[0].date, now),
      items,
      // 小计加的是 **amountInBase** 而不是 amount：一天里可能既有 RM12 又有 J¥500，
      // 把两个币种的数字直接相加会得出 512，那个数不表示任何东西。
      // 全 App 只要是"把多笔加起来"的地方，加数一律是折算后的值（SQL 那边的 SUM 也是）
      expense: items.filter((t) => t.type === 'EXPENSE').reduce((sum, t) => sum + t.amountInBase, 0),
      income: items.filter((t) => t.type === 'INCOME').reduce((sum, t) => sum + t.amountInBase, 0),
    }))
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

/**
 * 按月归堆，新的月份在最前面。**只有搜索结果用它。**
 *
 * 别的页面（首页、日历、分类下钻、账单总览）看的都是一段连续的、自己挑的时间范围，
 * 按天分卡最合适——那里每张卡回答的是"这一天花了多少"。
 * 搜索不一样：搜「鸣潮」出来的 8 笔可能横跨 2024 到 2026，彼此隔着好几个月，
 * 按天分就是 8 张各含一行的卡片，每张顶上还挂一条"当天小计"——
 * 那个小计等于那一行本身，是个永远重复的数。按月归堆之后，分节标题自己就把年份说清楚了。
 *
 * 不给 label 传 now：这里**不要**"今天/昨天"那套相对说法。搜索结果是跨年的，
 * 一屏里混着「今天」和「2024年7月」，读的人得在两种时间坐标之间来回切。
 */
export function groupTransactionsByMonth(
  transactions: TransactionWithCategory[] | undefined,
): TransactionMonthGroup[] {
  const groups = new Map<string, DatedTransaction[]>();

  for (const t of transactions ?? []) {
    const item = toDatedTransaction(t);
    const key = formatMonthKey(item.date);
    const existing = groups.get(key);
    if (existing) existing.push(item);
    else groups.set(key, [item]);
  }

  return [...groups.entries()]
    .map(([key, items]) => {
      // 堆里不保证有序（库返回的顺序由 SQL 决定），所以先按时间倒排，再拿第一条当这个月的代表
      const sorted = [...items].sort((a, b) => b.date.getTime() - a.date.getTime());
      return {
        key,
        date: sorted[0].date,
        label: formatYearMonth(sorted[0].date),
        items: sorted,
        // 加的是 amountInBase，理由同 groupTransactionsByDay：一堆里可能混着 RM 和 J¥
        expense: sorted.filter((t) => t.type === 'EXPENSE').reduce((sum, t) => sum + t.amountInBase, 0),
        income: sorted.filter((t) => t.type === 'INCOME').reduce((sum, t) => sum + t.amountInBase, 0),
      };
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}
