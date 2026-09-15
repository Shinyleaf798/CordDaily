import type { TransactionListItemData } from '@/components/transaction/transaction-list-item';
import type { BudgetStatus } from '@/db/budgets';
import type { MonthSummary, TransactionWithCategory } from '@/db/transactions';
import { useBudgetStatus } from '@/hooks/use-budgets';
import { useMonthSummary, useRecentTransactions } from '@/hooks/use-transactions';

export type HomeTransaction = TransactionListItemData & { date: Date };

export type HomeDayGroup = {
  key: string;
  date: Date;
  /** 主标签：今天 / 昨天 / 9月13日 */
  label: string;
  /** 副标签：主标签是相对说法时补具体日期，否则补星期 */
  subLabel: string;
  items: HomeTransaction[];
  expense: number;
  income: number;
};

/** 预算花得比时间快还是慢 */
export type BudgetPace = 'ahead' | 'behind' | 'even';

export type HomeViewData = {
  monthLabel: string;
  expense: number;
  income: number;
  balance: number;

  hasBudget: boolean;
  budgetTotal: number;
  spent: number;
  remaining: number;
  /** 预算已用百分比 */
  percentage: number;
  /** 这个月已经走过的百分比 */
  timePercentage: number;
  pace: BudgetPace;
  /** 预算进度超出时间进度多少个百分点（负数表示落后，也就是省着花） */
  paceDiff: number;
  dailyAverage: number;
  dailyRemaining: number;

  dayGroups: HomeDayGroup[];
};

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function stripTime(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatTime(iso: string) {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// 今天/昨天这两天用相对说法当主标签、具体日期当副标签；再往前就直接报日期，星期退到副标签。
// 相对说法找得快，具体日期又不能丢——两个都放，靠字号分主次
function formatDateGroupLabel(date: Date, now: Date) {
  const diffDays = Math.round((stripTime(now).getTime() - stripTime(date).getTime()) / 86400000);
  const monthDay = `${date.getMonth() + 1}月${date.getDate()}日`;
  const weekday = WEEKDAY_LABELS[date.getDay()];
  if (diffDays === 0) return { label: '今天', subLabel: `${monthDay} ${weekday}` };
  if (diffDays === 1) return { label: '昨天', subLabel: `${monthDay} ${weekday}` };
  return { label: monthDay, subLabel: weekday };
}

/**
 * 首页所有派生数字都算在这里，布局组件只负责画。
 *
 * 抽出来的理由不是"整洁"，是**一致性**：日均消费、预算节奏这些数都不是库里直接存的，
 * 如果每套布局各算各的，早晚出现"切到金环布局日均变了 0.01"这种没人查得出来的 bug。
 * 算一次，所有布局共用同一组数字。
 *
 * 跟 useHomeViewData 拆开是为了留一个纯函数入口：它不碰 React，给定输入永远给出同样的输出，
 * 以后要给"预算节奏"这类规则补测试，测这个函数就够了，不用渲染组件。
 */
export function buildHomeViewData(input: {
  now: Date;
  summary?: MonthSummary;
  budgetStatus?: BudgetStatus;
  recent?: TransactionWithCategory[];
}): HomeViewData {
  const { now, summary, budgetStatus, recent } = input;

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysElapsed = now.getDate();

  const budgetTotal = budgetStatus?.budgetTotal ?? 0;
  // 预算口径的"已消费"取各分类预算对应的花费之和，跟月度总支出不是同一个数：
  // 没设预算的分类不该算进预算消耗，否则永远显示超支
  const spent = budgetStatus?.spent ?? 0;
  const hasBudget = budgetTotal > 0;
  const remaining = budgetTotal - spent;
  const percentage = hasBudget ? (spent / budgetTotal) * 100 : 0;
  const timePercentage = (daysElapsed / daysInMonth) * 100;
  const paceDiff = percentage - timePercentage;
  // 3 个百分点的死区：不留这个区间的话，月初每天都在"快 1%"和"慢 1%"之间来回跳，
  // 提示天天变但没信息量，人就不看它了
  const pace: BudgetPace = paceDiff > 3 ? 'ahead' : paceDiff < -3 ? 'behind' : 'even';

  const remainingDays = Math.max(daysInMonth - daysElapsed, 1);
  const dailyAverage = daysElapsed > 0 ? spent / daysElapsed : 0;
  const dailyRemaining = remaining / remainingDays;

  // 列表行显示全部交易（包括"不计入统计"的），汇总数字则由 getMonthSummary / getBudgetStatus
  // 过滤掉它们——账单是流水，统计是口径，两者故意不一致
  const items: HomeTransaction[] = (recent ?? []).map((t) => ({
    id: t.id,
    date: new Date(t.date),
    icon: t.categoryIcon ?? '📦',
    title: t.title,
    categoryLabel: t.categoryName ?? '未分类',
    time: formatTime(t.date),
    note: t.remarks ?? undefined,
    amount: t.amount,
    type: t.type,
  }));

  const groups = new Map<string, HomeTransaction[]>();
  for (const item of items) {
    const key = stripTime(item.date).toISOString();
    const existing = groups.get(key);
    if (existing) existing.push(item);
    else groups.set(key, [item]);
  }

  const dayGroups: HomeDayGroup[] = [...groups.entries()]
    .map(([key, groupItems]) => {
      const date = groupItems[0].date;
      return {
        key,
        date,
        ...formatDateGroupLabel(date, now),
        items: groupItems,
        expense: groupItems.filter((t) => t.type === 'EXPENSE').reduce((sum, t) => sum + t.amount, 0),
        income: groupItems.filter((t) => t.type === 'INCOME').reduce((sum, t) => sum + t.amount, 0),
      };
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  return {
    monthLabel: `${now.getFullYear()}年${now.getMonth() + 1}月`,
    expense: summary?.expense ?? 0,
    income: summary?.income ?? 0,
    balance: summary?.balance ?? 0,
    hasBudget,
    budgetTotal,
    spent,
    remaining,
    percentage,
    timePercentage,
    pace,
    paceDiff,
    dailyAverage,
    dailyRemaining,
    dayGroups,
  };
}

/**
 * 首页取数的唯一入口：三个 React Query 查询 + 一次派生，调用方只拿到一个算好的 HomeViewData。
 *
 * 数据源是本机 SQLite 不是网络，用 React Query 纯粹是为了缓存和失效机制（同 use-transactions）。
 * 三个查询各自独立缓存，记一笔之后由 invalidateAll 统一失效，这里不需要手动刷新。
 */
export function useHomeViewData(): HomeViewData {
  const { data: summary } = useMonthSummary();
  const { data: budgetStatus } = useBudgetStatus();
  const { data: recent } = useRecentTransactions(7);

  // 每次渲染重新取"现在"，而不是模块加载时取一次：App 挂在后台过了零点再回来，
  // "今天/昨天"的分组标题和"这个月已经走了几天"都得跟着变
  return buildHomeViewData({ now: new Date(), summary, budgetStatus, recent });
}
