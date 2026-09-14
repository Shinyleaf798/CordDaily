import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type MonthSummaryCardProps = {
  month: string;
  expense: number;
  income: number;
  balance: number;
};

// 月度收支总览卡片，纯展示组件，数字从首页传进来（现在是 mock，接真实数据时首页负责换）
export function MonthSummaryCard({ month, expense, income, balance }: MonthSummaryCardProps) {
  const theme = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: theme.accentSecondary }]}>
      <ThemedText type="small" style={[styles.month, { color: theme.onAccent }]}>
        {month} · 支出
      </ThemedText>
      <ThemedText style={[styles.expense, { color: theme.onAccent }]}>RM{expense.toFixed(2)}</ThemedText>

      <View style={styles.footerRow}>
        <ThemedText type="small" style={[styles.footerText, { color: theme.onAccent }]}>
          收入 RM{income.toFixed(2)}
        </ThemedText>
        <ThemedText type="small" style={[styles.footerText, { color: theme.onAccent }]}>
          结余 {balance < 0 ? '-' : ''}RM{Math.abs(balance).toFixed(2)}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: Spacing.four,
  },
  month: {
    opacity: 0.85,
  },
  expense: {
    fontSize: 36,
    lineHeight: 44,
    fontWeight: '700',
    marginTop: Spacing.one,
  },
  footerRow: {
    flexDirection: 'row',
    gap: Spacing.four,
    marginTop: Spacing.three,
  },
  footerText: {
    opacity: 0.9,
  },
});
