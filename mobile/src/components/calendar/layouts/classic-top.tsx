import { StyleSheet, View } from 'react-native';

import { CalendarMonthGrid } from '@/components/calendar/calendar-month-grid';
import { CalendarSummaryHeader } from '@/components/calendar/calendar-summary-header';
import type { CalendarTopProps } from '@/components/calendar/layouts/types';
import { ThemedView } from '@/components/ui/themed-view';
import { DividerWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * 上半 · 经典：总览和月历合在**一张**卡里，中间一条细线。
 *
 * 原来是两张 20 圆角的卡上下摞着，加上底下当天那张，三张圆角卡读起来像一串气泡。
 * 总览和月历回答的是同一件事（这个月怎么样），圆角只给这一组的外轮廓
 */
export function ClassicTop({
  data,
  selectedKey,
  onSelectDay,
  onPrevMonth,
  onNextMonth,
  onBackToCurrentMonth,
}: CalendarTopProps) {
  const theme = useTheme();
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <CalendarSummaryHeader
        monthLabel={data.monthLabel}
        monthExpense={data.monthExpense}
        monthIncome={data.monthIncome}
        dailyAverage={data.dailyAverage}
        dailyAverageHint={data.dailyAverageHint}
        onPrevMonth={onPrevMonth}
        onNextMonth={onNextMonth}
        onBackToCurrentMonth={onBackToCurrentMonth}
      />
      <View style={[styles.divider, { backgroundColor: theme.divider }]} />
      <CalendarMonthGrid
        weeks={data.weeks}
        maxDayExpense={data.maxDayExpense}
        selectedKey={selectedKey}
        onSelectDay={onSelectDay}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  // 内距 10 是月历要的（格子越宽越好）；总览自己再补 8。
  // 不收圆角：日历和统计两页的卡片都是直角（见 DECISIONS.md）
  card: {
    padding: 10,
  },
  divider: {
    // 整 1 像素而不是发丝线：这条线要撑起"上下两段"，发丝线在深色主题里几乎看不见
    height: DividerWidth,
    marginHorizontal: 8,
    marginTop: 4,
    marginBottom: 10,
  },
});
