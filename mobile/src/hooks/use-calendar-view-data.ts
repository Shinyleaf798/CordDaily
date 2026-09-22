import type { TransactionListItemData } from '@/components/transaction/transaction-list-item';
import type { TransactionWithCategory } from '@/db/transactions';
import { useMonthTransactions } from '@/hooks/use-transactions';
import { formatClockTime, formatDayGroupLabel, formatDayKey, isSameDay } from '@/utils/date';

export type CalendarDay = {
  /** 2026-09-13，同时是选中状态存的值 */
  key: string;
  date: Date;
  dayOfMonth: number;
  /** 当天计入统计的支出/收入合计 */
  expense: number;
  income: number;
  /** 当天有没有账单。跟 expense > 0 不是一回事：整天都是"不计入统计"的账时合计是 0，但明细不是空的 */
  hasTransactions: boolean;
  isToday: boolean;
  /** 今天之后的日子。正常不会有账，但日期可以往后选，所以画的时候淡一点 */
  isFuture: boolean;
};

export type CalendarSelection = {
  key: string;
  date: Date;
  /** 今天 / 昨天 / 9月13日 */
  label: string;
  /** 9月17日 周三 / 周三 */
  subLabel: string;
  expense: number;
  income: number;
  items: TransactionListItemData[];
};

export type CalendarViewData = {
  /** 2026年9月 */
  monthLabel: string;
  monthExpense: number;
  monthIncome: number;
  dailyAverage: number;
  /** 日均是拿什么当分母算的，直接写给用户看 */
  dailyAverageHint: string;
  /** 一行七格，开头的 null 是上个月的占位 */
  weeks: (CalendarDay | null)[][];
  /** 当月单日最高支出，格子的深浅按它归一化 */
  maxDayExpense: number;
  /** 没选中、或选中的那天不属于当前显示的月份时是 null */
  selection: CalendarSelection | null;
};

// 一周从周日起算，跟 WEEKDAY_LABELS 的顺序对齐（那个数组是周日打头）
const DAYS_PER_WEEK = 7;

/**
 * 日历页的全部派生数据算在这里，组件只负责画——理由同 buildHomeViewData：
 * "日均消费"这类数字一旦有第二个算法，就会出现首页和日历页对不上的 bug。
 *
 * 不碰 React，给定输入永远给出同样的输出，以后要给"空日子/跨月/不计入统计"这些
 * 边界补测试，测这个函数就够了。
 *
 * 两套口径在这里同时算出来，是故意的：
 * - 格子上的数字和顶部总额**跳过** excludeFromStats（那是统计口径，跟首页/预算一致）
 * - 展开的当天明细**显示全部**交易（那是流水，记了就该看得到）
 * 所以才需要 hasTransactions 这个标记：合计 0 但有账的日子，格子上得留个记号，
 * 否则用户会觉得"这天明明记过账，日历上却什么都没有"。
 *
 * 注意 selection 里的当天合计也跳过 excludeFromStats，跟格子上那个数**必须**是同一个数——
 * 点开一个写着 50 的格子，下面标题却写 80，比两处都不准还糟。
 * 这跟首页的当天小计（那边是流水口径，含 excludeFromStats）确实会差一点，
 * 差值只在用了"不计入统计"的日子出现；日历里保内部一致优先。
 */
export function buildCalendarViewData(input: {
  month: Date;
  now: Date;
  selectedKey: string | null;
  transactions?: TransactionWithCategory[];
}): CalendarViewData {
  const { month, now, selectedKey, transactions } = input;

  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  // 按"哪一天"归堆。key 一律走 formatDayKey（本地时区），不切 ISO 字符串
  type Bucket = { expense: number; income: number; items: TransactionListItemData[] };
  const buckets = new Map<string, Bucket>();

  for (const t of transactions ?? []) {
    const date = new Date(t.date);
    const key = formatDayKey(date);
    const bucket = buckets.get(key) ?? { expense: 0, income: 0, items: [] };

    if (!t.excludeFromStats) {
      if (t.type === 'EXPENSE') bucket.expense += t.amountInBase;
      else bucket.income += t.amountInBase;
    }

    bucket.items.push({
      id: t.id,
      // icon 原样传，三种写法怎么渲染由 CategoryIcon 回答（同首页）
      icon: t.categoryIcon,
      title: t.title,
      categoryLabel: t.categoryName ?? '未分类',
      time: formatClockTime(date),
      note: t.remarks ?? undefined,
      amount: t.amount,
      type: t.type,
    });

    buckets.set(key, bucket);
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const days: CalendarDay[] = [];
  for (let dayOfMonth = 1; dayOfMonth <= daysInMonth; dayOfMonth += 1) {
    const date = new Date(year, monthIndex, dayOfMonth);
    const key = formatDayKey(date);
    const bucket = buckets.get(key);
    days.push({
      key,
      date,
      dayOfMonth,
      expense: bucket?.expense ?? 0,
      income: bucket?.income ?? 0,
      hasTransactions: (bucket?.items.length ?? 0) > 0,
      isToday: isSameDay(date, now),
      isFuture: date.getTime() > today.getTime(),
    });
  }

  // 首格前面补空位：1号是周几，前面就空几格。末尾补到整周——不补的话最后一行只有两三格，
  // 画的时候 flex: 1 会把它们摊开占满整行（切法跟 datetime-picker-sheet 里那个日历一致，
  // 连"为什么不能用 width: 14.2857%"的原因也在那边的注释里写着）
  const leadingBlanks = new Date(year, monthIndex, 1).getDay();
  const cells: (CalendarDay | null)[] = [...Array<null>(leadingBlanks).fill(null), ...days];
  while (cells.length % DAYS_PER_WEEK !== 0) cells.push(null);

  const weeks: (CalendarDay | null)[][] = [];
  for (let i = 0; i < cells.length; i += DAYS_PER_WEEK) weeks.push(cells.slice(i, i + DAYS_PER_WEEK));

  const monthExpense = days.reduce((sum, day) => sum + day.expense, 0);
  const monthIncome = days.reduce((sum, day) => sum + day.income, 0);
  const maxDayExpense = days.reduce((max, day) => Math.max(max, day.expense), 0);

  // 日均的分母：看的是本月就只除已经过完的天数（月初 3 号除以 30 会得出一个假的"很省"），
  // 看的是过去的月份就除整月天数。未来的月份没有账，分母用整月天数，结果是 0
  const isCurrentMonth = year === now.getFullYear() && monthIndex === now.getMonth();
  const isPastMonth = new Date(year, monthIndex, 1) < new Date(now.getFullYear(), now.getMonth(), 1);
  const divisor = isCurrentMonth ? now.getDate() : daysInMonth;
  const dailyAverage = divisor > 0 ? monthExpense / divisor : 0;
  const dailyAverageHint = isCurrentMonth
    ? `已过 ${divisor} 天`
    : isPastMonth
      ? `全月 ${divisor} 天`
      : '尚未开始';

  // 选中的那天不在当前月份里（切月之后）就当没选，而不是显示上个月那天的明细
  const selectedDay = selectedKey ? days.find((day) => day.key === selectedKey) : undefined;
  const selection: CalendarSelection | null = selectedDay
    ? {
        key: selectedDay.key,
        date: selectedDay.date,
        ...formatDayGroupLabel(selectedDay.date, now),
        expense: selectedDay.expense,
        income: selectedDay.income,
        // 一天之内的顺序直接沿用查询的 date DESC（晚上记的在上面，跟首页列表方向一致）
        items: buckets.get(selectedDay.key)?.items ?? [],
      }
    : null;

  return {
    monthLabel: `${year}年${monthIndex + 1}月`,
    monthExpense,
    monthIncome,
    dailyAverage,
    dailyAverageHint,
    weeks,
    maxDayExpense,
    selection,
  };
}

/**
 * 日历页取数入口：一个月一次查询 + 一次派生。
 *
 * 只查当前显示的这个月，不一次拉全部交易：往前翻几个月就多几次查询，
 * 但每次的结果都按月缓存（useMonthTransactions 的 queryKey 带月份），翻回来是命中缓存的。
 */
export function useCalendarViewData(month: Date, selectedKey: string | null): CalendarViewData {
  const { data: transactions } = useMonthTransactions(month);

  // "现在"每次渲染重新取：App 挂在后台过了零点再回来，今天的高亮要跟着挪（同首页）
  return buildCalendarViewData({ month, now: new Date(), selectedKey, transactions });
}
