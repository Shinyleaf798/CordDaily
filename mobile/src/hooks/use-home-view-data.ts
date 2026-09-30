import { HomeRangeTitles, homeRangeBounds, type HomeRange } from '@/constants/home-range';
import type { BudgetStatus } from '@/db/budgets';
import type { MonthSummary, TransactionWithCategory } from '@/db/transactions';
import { useBudgetStatus } from '@/hooks/use-budgets';
import { useMonthSummary, useTransactionsInRange } from '@/hooks/use-transactions';
import { useHomeStore } from '@/store/home.store';
import { groupTransactionsByDay, type DatedTransaction, type TransactionDayGroup } from '@/utils/transaction-view';

// 「一行账单」和「按天分好的一堆」这两个形状全 App 共用一份（见 utils/transaction-view）。
// 这里留两个别名是因为首页这边的调用方（两套布局）一直按这个名字在用
export type HomeTransaction = DatedTransaction;
export type HomeDayGroup = TransactionDayGroup;

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
  /** 账单那一段的标题，跟着用户选的区间走：近7天账单 / 本月账单 / 全部账单… */
  billsTitle: string;
};

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
  range: HomeRange;
  summary?: MonthSummary;
  budgetStatus?: BudgetStatus;
  recent?: TransactionWithCategory[];
}): HomeViewData {
  const { now, range, summary, budgetStatus, recent } = input;

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysElapsed = now.getDate();

  const budgetTotal = budgetStatus?.budgetTotal ?? 0;
  // 预算口径的"已消费"= 本月全部支出（跳过 excludeFromStats）。
  // 跟 summary.expense 的区别只在于它来自 budgetStatus 这个查询，口径是一致的
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
  const dayGroups = groupTransactionsByDay(recent, now);

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
    billsTitle: HomeRangeTitles[range],
  };
}

/**
 * 首页取数的唯一入口：三个 React Query 查询 + 一次派生，调用方只拿到一个算好的 HomeViewData。
 *
 * 数据源是本机 SQLite 不是网络，用 React Query 纯粹是为了缓存和失效机制（同 use-transactions）。
 * 三个查询各自独立缓存，记一笔之后由 invalidateAll 统一失效，这里不需要手动刷新。
 */
export function useHomeViewData(): HomeViewData {
  // 「看多长一段」直接在这里读，不从首页传进来：它只影响取数，
  // 布局组件拿到的永远是一份算好的 HomeViewData，多一个 prop 只会让四个段组件都得转发它
  const range = useHomeStore((s) => s.range);

  const { data: summary } = useMonthSummary();
  const { data: budgetStatus } = useBudgetStatus();

  // 每次渲染重新取"现在"，而不是模块加载时取一次：App 挂在后台过了零点再回来，
  // "今天/昨天"的分组标题和"这个月已经走了几天"都得跟着变
  const now = new Date();
  // 区间边界按天对齐（见 homeRangeBounds），所以同一天内反复渲染拿到的是同一个 start，
  // React Query 的 key 不会因为"现在"差了几毫秒就变一个，缓存照样命中
  const { start, end } = homeRangeBounds(range, now);
  const { data: recent } = useTransactionsInRange(start, end);

  return buildHomeViewData({ now, range, summary, budgetStatus, recent });
}
