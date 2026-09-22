import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import type { CalendarDay } from '@/hooks/use-calendar-view-data';
import { useTheme } from '@/hooks/use-theme';
import { formatCompactAmount } from '@/utils/format';

type CalendarDayCellProps = {
  day: CalendarDay;
  isSelected: boolean;
  /** 当月单日最高支出，用来把这天的支出换算成深浅 */
  maxExpense: number;
  onPress: () => void;
};

// 支出越多底色越深。四档而不是连续渐变：连续变化人眼分不出 38% 和 44% 的区别，
// 分档之后"这周有两天明显深"才看得出来。十六进制后两位是 alpha（RN 认 #RRGGBBAA）
const HEAT_ALPHA = ['', '1f', '33', '4d', '66'];

function heatLevel(expense: number, maxExpense: number): number {
  if (expense <= 0 || maxExpense <= 0) return 0;
  const ratio = expense / maxExpense;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

/**
 * 日历里的一格：上面日期，下面当天金额。
 *
 * 三种"没数字"的情况故意画得不一样：
 * - 完全没记账 → 只有日期，什么都不加
 * - 有账但合计是 0（整天都是"不计入统计"的，比如垫付待报销）→ 日期下面点一个小点，
 *   告诉用户"这里有东西，点进去看"，否则会以为自己那天没记
 * - 只有收入没有支出 → 显示绿色的 +金额，不跟支出抢同一个颜色
 */
export function CalendarDayCell({ day, isSelected, maxExpense, onPress }: CalendarDayCellProps) {
  const theme = useTheme();

  const level = heatLevel(day.expense, maxExpense);
  const heatColor = level > 0 ? theme.cardHighlight + HEAT_ALPHA[level] : 'transparent';

  // 选中态盖掉热度色：这一格现在代表"你正在看的那天"，比"花了多少"更重要
  const backgroundColor = isSelected ? theme.cardHighlight : heatColor;
  const dayColor = isSelected ? theme.onCardHighlight : day.isFuture ? theme.textSecondary : theme.text;

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.cell,
        { backgroundColor },
        // 今天描一圈边。选中时不描——底色已经是强调色，再描一圈只会糊成一团
        day.isToday && !isSelected && { borderColor: theme.cardHighlight, borderWidth: 1.5 },
      ]}>
      <ThemedText style={[styles.day, { color: dayColor }, day.isToday && styles.dayToday]}>
        {day.dayOfMonth}
      </ThemedText>

      {day.expense > 0 ? (
        <ThemedText
          numberOfLines={1}
          style={[styles.amount, { color: isSelected ? theme.onCardHighlight : theme.text }]}>
          {formatCompactAmount(day.expense)}
        </ThemedText>
      ) : day.income > 0 ? (
        <ThemedText
          numberOfLines={1}
          style={[styles.amount, { color: isSelected ? theme.onCardHighlight : theme.income }]}>
          +{formatCompactAmount(day.income)}
        </ThemedText>
      ) : day.hasTransactions ? (
        <View style={[styles.dot, { backgroundColor: isSelected ? theme.onCardHighlight : theme.textSecondary }]} />
      ) : (
        // 占位：三种情况的格子高度要一样，否则同一行的日期数字会上下错开
        <View style={styles.amountPlaceholder} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  day: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '500',
  },
  dayToday: {
    fontWeight: '700',
  },
  amount: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '600',
  },
  amountPlaceholder: {
    height: 12,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginVertical: 4,
  },
});
