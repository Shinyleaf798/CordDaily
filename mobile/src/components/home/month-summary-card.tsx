import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatAmount, formatCurrency } from '@/utils/format';

type MonthSummaryCardProps = {
  expense: number;
  income: number;
  balance: number;
};

// 月度收支总览卡片，纯展示组件，数字从首页传进来。
// 月份不在这张卡里显示了——首页标题栏右边的月份 chip 统管整屏的时间范围，
// 卡片里再写一次"9月"只是重复。
export function MonthSummaryCard({ expense, income, balance }: MonthSummaryCardProps) {
  const theme = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText themeColor="textSecondary" style={styles.label}>
        本月支出
      </ThemedText>

      {/* 货币符号单独拆出来用强调色、小一号：主角是数字本身，RM 只是单位 */}
      <View style={styles.amountRow}>
        <ThemedText style={[styles.currency, { color: theme.cardHighlight }]}>RM</ThemedText>
        <ThemedText style={styles.amount}>{formatAmount(expense)}</ThemedText>
      </View>

      <View style={[styles.statsRow, { borderTopColor: theme.backgroundSelected }]}>
        <View style={styles.stat}>
          <View style={styles.statLabelRow}>
            <View style={[styles.dot, { backgroundColor: theme.income }]} />
            <ThemedText themeColor="textSecondary" style={styles.statLabel}>
              本月收入
            </ThemedText>
          </View>
          <ThemedText style={[styles.statValue, { color: theme.income }]}>{formatCurrency(income)}</ThemedText>
        </View>

        <View style={[styles.statDivider, { backgroundColor: theme.backgroundSelected }]} />

        <View style={styles.stat}>
          <View style={styles.statLabelRow}>
            <View style={[styles.dot, { backgroundColor: theme.cardHighlight }]} />
            <ThemedText themeColor="textSecondary" style={styles.statLabel}>
              本月结余
            </ThemedText>
          </View>
          <ThemedText style={[styles.statValue, balance < 0 && { color: theme.expense }]}>
            {formatCurrency(balance)}
          </ThemedText>
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
    marginTop: 6,
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
  statLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
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
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
