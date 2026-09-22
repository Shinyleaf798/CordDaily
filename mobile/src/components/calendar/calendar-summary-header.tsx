import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatAmount, formatCurrency } from '@/utils/format';

type CalendarSummaryHeaderProps = {
  monthLabel: string;
  monthExpense: number;
  monthIncome: number;
  dailyAverage: number;
  dailyAverageHint: string;
  /** 当前看的不是本月时显示"回到本月"，是本月时为 undefined */
  onBackToCurrentMonth?: () => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
};

/**
 * 日历顶部：月份切换 + 本月总消费 + 日均。
 *
 * 数字排版照搬 MonthSummaryCard（大号总额 + 下面一排次级数字），但没有直接复用那个组件：
 * 那张卡是"本月"三个数（支出/收入/结余）的固定组合，这里要的是支出 + 日均，
 * 而且多一个月份切换行。硬塞成一个带一堆开关的通用卡片，两边都会变难改。
 */
export function CalendarSummaryHeader({
  monthLabel,
  monthExpense,
  monthIncome,
  dailyAverage,
  dailyAverageHint,
  onBackToCurrentMonth,
  onPrevMonth,
  onNextMonth,
}: CalendarSummaryHeaderProps) {
  const theme = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.monthRow}>
        <Pressable onPress={onPrevMonth} hitSlop={10} style={styles.arrow}>
          <Ionicons name="chevron-back" size={18} color={theme.textSecondary} />
        </Pressable>

        <ThemedText style={styles.monthLabel}>{monthLabel}</ThemedText>

        <Pressable onPress={onNextMonth} hitSlop={10} style={styles.arrow}>
          <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
        </Pressable>

        {/* 翻远了之后的退路。一直显示的话本月也挂着一个按不按都一样的按钮 */}
        {onBackToCurrentMonth ? (
          <Pressable onPress={onBackToCurrentMonth} hitSlop={8} style={styles.backToday}>
            <ThemedText style={[styles.backTodayText, { color: theme.cardHighlight }]}>回到本月</ThemedText>
          </Pressable>
        ) : null}
      </View>

      <ThemedText themeColor="textSecondary" style={styles.label}>
        本月消费
      </ThemedText>
      <View style={styles.amountRow}>
        <ThemedText style={[styles.currency, { color: theme.cardHighlight }]}>RM</ThemedText>
        <ThemedText style={styles.amount}>{formatAmount(monthExpense)}</ThemedText>
      </View>

      <View style={[styles.statsRow, { borderTopColor: theme.backgroundSelected }]}>
        <View style={styles.stat}>
          <ThemedText themeColor="textSecondary" style={styles.statLabel}>
            日均消费 · {dailyAverageHint}
          </ThemedText>
          <ThemedText style={styles.statValue}>{formatCurrency(dailyAverage)}</ThemedText>
        </View>

        <View style={[styles.statDivider, { backgroundColor: theme.backgroundSelected }]} />

        <View style={styles.stat}>
          <ThemedText themeColor="textSecondary" style={styles.statLabel}>
            本月收入
          </ThemedText>
          <ThemedText style={[styles.statValue, { color: theme.income }]}>{formatCurrency(monthIncome)}</ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 18,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  arrow: {
    padding: 2,
  },
  monthLabel: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    // 月份宽度会随位数变（2026年9月 / 2026年12月），固定一个最小宽度，箭头才不会左右跳
    minWidth: 96,
    textAlign: 'center',
  },
  backToday: {
    marginLeft: 'auto',
  },
  backTodayText: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    letterSpacing: 0.4,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 4,
  },
  currency: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '600',
  },
  amount: {
    fontSize: 36,
    lineHeight: 42,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  stat: {
    flex: 1,
    gap: 3,
  },
  statLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  statValue: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600',
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    marginHorizontal: Spacing.three,
  },
});
