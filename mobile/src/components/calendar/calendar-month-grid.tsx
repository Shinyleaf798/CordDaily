import { StyleSheet, View } from 'react-native';

import { CalendarDayCell } from '@/components/calendar/calendar-day-cell';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import type { CalendarDay } from '@/hooks/use-calendar-view-data';
import { WEEKDAY_LABELS } from '@/utils/date';

type CalendarMonthGridProps = {
  weeks: (CalendarDay | null)[][];
  maxDayExpense: number;
  selectedKey: string | null;
  onSelectDay: (key: string) => void;
};

// 月历网格：星期表头 + 若干整周。
// 上个月/下个月的日子一律留空，不画成灰色数字——那些格子点下去要么得跳月要么没反应，
// 两种都不好；日历页翻月有自己的箭头，边角上不该再冒出第二条路径。
export function CalendarMonthGrid({ weeks, maxDayExpense, selectedKey, onSelectDay }: CalendarMonthGridProps) {
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.weekRow}>
        {WEEKDAY_LABELS.map((label) => (
          <ThemedText key={label} themeColor="textSecondary" style={styles.weekday}>
            {/* 只取"周三"的最后一个字：格子宽度就那么点，两个字会把表头挤得比日期还满 */}
            {label.slice(-1)}
          </ThemedText>
        ))}
      </View>

      {weeks.map((week, weekIndex) => (
        <View key={weekIndex} style={styles.weekRow}>
          {week.map((day, dayIndex) =>
            day ? (
              <CalendarDayCell
                key={day.key}
                day={day}
                isSelected={day.key === selectedKey}
                maxExpense={maxDayExpense}
                onPress={() => onSelectDay(day.key)}
              />
            ) : (
              <View key={`blank-${dayIndex}`} style={styles.blank} />
            ),
          )}
        </View>
      ))}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 10,
    gap: 4,
  },
  weekRow: {
    flexDirection: 'row',
    gap: 4,
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 20,
    fontWeight: '500',
  },
  // 空位要跟真格子一样宽高，否则 1 号不会落在正确的星期下面。
  // flex: 1 而不是 width: '14.2857%'——百分比在 7 列上会因四舍五入排不下，
  // 表头会变成"日一二三四五 / 六"，详见 DECISIONS.md 2026-09-18 那条
  blank: {
    flex: 1,
    aspectRatio: 1,
  },
});
