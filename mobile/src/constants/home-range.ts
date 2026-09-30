import { addDays, startOfDay, startOfMonth } from '@/utils/date';

/**
 * 首页账单列表看多长一段。原来写死「近7天」。
 *
 * 这几档不是随便挑的：**7天/30天/3个月/一年是滚动窗口**（"从今天往回数"），
 * **本月是自然月**（"这个月1号到月底"）。两种口径都要，因为它们回答不同的问题——
 * 「最近花得凶不凶」是滚动的，「这个月还剩多少」是自然月的，后者跟预算卡对得上。
 *
 * 「全部」不设下限。那一档在账多了之后会一次性查出上千行，
 * 首页的 ScrollView 会把它们全渲染出来——所以它是给"我就想翻翻"准备的，
 * 不该当默认值（默认仍然是 7 天）。
 */
export type HomeRange = 'd7' | 'd30' | 'month' | 'm3' | 'y1' | 'all';

export const HomeRanges: HomeRange[] = ['d7', 'd30', 'month', 'm3', 'y1', 'all'];

/** 设置页上那排选项的名字 */
export const HomeRangeLabels: Record<HomeRange, string> = {
  d7: '7天',
  d30: '30天',
  month: '本月',
  m3: '3个月',
  y1: '一年',
  all: '全部',
};

/**
 * 首页上那行分区标题。跟上面的短标签分开写：
 * 选项里「7天」够了（旁边还有五个同类项衬着），但首页上只剩这一行字，
 * 得自己说清楚它管的是什么——「近7天账单」而不是光一个「7天」。
 */
export const HomeRangeTitles: Record<HomeRange, string> = {
  d7: '近7天账单',
  d30: '近30天账单',
  month: '本月账单',
  m3: '近3个月账单',
  y1: '近一年账单',
  all: '全部账单',
};

/**
 * 这一档对应的查询区间，喂给 useTransactionsInRange。
 * `null` 表示这一头不设限（跟那个 hook 的约定一致）。
 *
 * 滚动窗口的上限一律是 null 而不是"今天结束"：日期填在未来的账（比如先记下个月的房租）
 * 也该出现在列表里。自然月那一档例外——它的上限就是这个月的边界，
 * 下个月的账出现在「本月账单」里是错的。
 */
export function homeRangeBounds(range: HomeRange, now: Date): { start: Date | null; end: Date | null } {
  const today = startOfDay(now);

  switch (range) {
    // 减 6 不是减 7：「近7天」含今天，今天是第 1 天
    case 'd7':
      return { start: addDays(today, -6), end: null };
    case 'd30':
      return { start: addDays(today, -29), end: null };
    case 'month':
      return { start: startOfMonth(now), end: startOfMonth(new Date(now.getFullYear(), now.getMonth() + 1, 1)) };
    // 按自然月往回退，不是减 90 天：「3个月前」是个日历概念，
    // 减固定天数会让 2 月和 7 月退出不一样远的距离
    case 'm3':
      return { start: startOfDay(new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())), end: null };
    case 'y1':
      return { start: startOfDay(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())), end: null };
    case 'all':
      return { start: null, end: null };
  }
}
