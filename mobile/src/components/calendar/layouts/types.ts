import type { CalendarSelection, CalendarViewData } from '@/hooks/use-calendar-view-data';

/**
 * 日历两段各自的契约，照首页 layouts/types 同一个规矩：算好的数据进来，用户的动作出去，
 * 段自己不取数、不管滚动容器和屏幕内距（那是 app/(tabs)/calendar 的事）。
 *
 * 看哪个月、选了哪天都是页面的 state，不归段：换一种画法时这两样不该被重置
 */

/** 上半：月份、本月数字、月历 */
export type CalendarTopProps = {
  data: CalendarViewData;
  /** 正在看的那个月的 1 号。热力那套要把月份拆成大号数字 + 年份，monthLabel 那一串拆不开 */
  month: Date;
  selectedKey: string | null;
  onSelectDay: (key: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  /** 看的不是本月时才有，是本月时为 undefined（不显示「回到本月」） */
  onBackToCurrentMonth?: () => void;
};

/** 下半：选中那天的明细。没选中时是 null，段自己画"点一天看看" */
export type CalendarDayProps = {
  selection: CalendarSelection | null;
  onSelectTransaction: (id: string) => void;
};
