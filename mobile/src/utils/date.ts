// 日期的纯函数工具。全部按**本地时区**算，不碰 UTC：
// 库里存的是 ISO 字符串（带时区信息），读出来 new Date(iso) 之后一律用 getFullYear/getMonth/getDate
// 这组本地取值的方法。用 toISOString().slice(0,10) 取日期在东八区是错的——
// 凌晨 8 点前记的账会被算到前一天去。

export const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** 抹掉时分秒，只留"哪一天"。比较两个日期是不是同一天、算天数差都要先过这一步 */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** later 比 earlier 晚几天。用 round 而不是 floor：夏令时那天两个 00:00 之间只差 23 小时 */
export function diffInDays(later: Date, earlier: Date): number {
  return Math.round((startOfDay(later).getTime() - startOfDay(earlier).getTime()) / 86400000);
}

/** 14:05。补零不用 padStart 以外的花样，账单列表里时间要对齐 */
export function formatClockTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** 2026-09。给"这是哪个月"当 key 用——注意不能写成 toISOString().slice(0,7)，
 *  那在东八区每月 1 号的 00:00-08:00 之间会算成上个月，跟本文件顶上说的是同一个坑 */
export function formatMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** 2026-09-13。给"这是哪一天"当 key 用——同样不能写成 toISOString().slice(0,10)，
 *  理由见本文件顶上：那切出来的是 UTC 日期，东八区凌晨记的账会被算到前一天 */
export function formatDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** 9月13日 */
export function formatMonthDay(date: Date): string {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/** 把某一天和某个时刻拼起来。秒归零：记账精确到分就够了，秒只会让同一分钟内的两笔排序看着随机 */
export function withTime(day: Date, hours: number, minutes: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes, 0, 0);
}

/**
 * 完整写法：昨天 9月16日 16:00 / 9月3日 14:30。
 *
 * 详情弹层用它——那里要回答的是"这笔到底是哪天几点记的"，只说"昨天"不够（昨天几点？），
 * 只说"9月16日"也不够（那是前天还是上周？）。相对词负责快速定位，绝对日期负责说准，两个都要。
 * 列表里一行的位置不够，那边用 formatDayLabel 的简写。
 */
export function formatDateTimeLabel(date: Date, now: Date = new Date()): string {
  const diff = diffInDays(now, date);
  const relative = diff === 0 ? '今天 ' : diff === 1 ? '昨天 ' : diff === -1 ? '明天 ' : '';
  // 走 formatMonthDay 而不是自己拼：全 App 的"几月几日"只有这一处定义，
  // 改成"号"或者别的写法时不会漏掉某一个界面
  return `${relative}${formatMonthDay(date)} ${formatClockTime(date)}`;
}

/**
 * 一行式的日期说法：今天 / 昨天 / 明天 / 9月13日 周三。
 * 给按钮、chip 这类只有一行位置的地方用；账单列表的分组标题要主副两行，那个另算。
 */
export function formatDayLabel(date: Date, now: Date = new Date()): string {
  const diff = diffInDays(now, date);
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  if (diff === -1) return '明天';
  return `${formatMonthDay(date)} ${WEEKDAY_LABELS[date.getDay()]}`;
}

/**
 * 账单分组标题的主/副两行：今天 · 9月17日 周三 / 9月13日 · 周三。
 *
 * 今天、昨天这两天用相对说法当主标签、具体日期当副标签；再往前就直接报日期，星期退到副标签。
 * 相对说法找得快，具体日期又不能丢——两个都放，靠字号分主次。
 *
 * 原先长在 use-home-view-data 里，日历页的"当天明细"要用同一套说法，所以挪到这里：
 * 两份各自演化的话，同一天在首页叫"昨天"、在日历页叫"9月21日"，看起来像两个不同的东西。
 */
export function formatDayGroupLabel(date: Date, now: Date = new Date()): { label: string; subLabel: string } {
  const diffDays = diffInDays(now, date);
  const monthDay = formatMonthDay(date);
  const weekday = WEEKDAY_LABELS[date.getDay()];
  if (diffDays === 0) return { label: '今天', subLabel: `${monthDay} ${weekday}` };
  if (diffDays === 1) return { label: '昨天', subLabel: `${monthDay} ${weekday}` };
  return { label: monthDay, subLabel: weekday };
}
