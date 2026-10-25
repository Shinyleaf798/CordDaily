/**
 * 日历页的可切换画法，照首页（constants/home-layout）同一套思路：
 * 页面分成上下两段，各自独立选画法，「编辑」弹层第一层的两个预设只是"两段一起设成同一种"的快捷方式。
 *
 * - **上半**：月份、本月数字、月历
 * - **下半**：选中那天的明细
 *
 * 两段之间没有依赖：热力月历底下接一张卡片式明细，或者卡片月历底下接通栏明细，都说得通。
 */

export type CalendarLayoutName = 'classic' | 'heat';

export const CalendarLayoutNames: CalendarLayoutName[] = ['classic', 'heat'];

/** 第一层预设和第二层图卡共用这两个名字 */
export const CalendarLayoutLabels: Record<CalendarLayoutName, string> = {
  classic: '经典',
  heat: '热力',
};

export const CalendarPresetHints: Record<CalendarLayoutName, string> = {
  classic: '卡片月历',
  heat: '热力 + 通栏',
};

export type CalendarSlot = 'top' | 'day';

export const CalendarSlots: CalendarSlot[] = ['top', 'day'];

export const CalendarSlotLabels: Record<CalendarSlot, string> = {
  top: '上半 · 月历',
  day: '下半 · 当天账单',
};

// 同一个名字在两段里做的是两件事，提示语按段分开写（理由同首页的 HomeSlotHints）
export const CalendarSlotHints: Record<CalendarSlot, Record<CalendarLayoutName, string>> = {
  top: { classic: '两张卡片', heat: '热力月历' },
  day: { classic: '一张卡片', heat: '通栏细线' },
};
