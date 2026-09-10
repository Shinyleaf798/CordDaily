import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

type MonthSummaryCardProps = {
  month: string;
  expense: number;
  income: number;
  balance: number;
};

// 月度收支总览卡片，纯展示组件，数字从首页传进来（现在是 mock，接真实数据时首页负责换）
export function MonthSummaryCard({ month, expense, income, balance }: MonthSummaryCardProps) {
  return (
    <View style={styles.card}>
      <ThemedText type="small" style={styles.month}>
        {month} · 支出
      </ThemedText>
      <ThemedText style={styles.expense}>RM{expense.toFixed(2)}</ThemedText>

      <View style={styles.footerRow}>
        <ThemedText type="small" style={styles.footerText}>
          收入 RM{income.toFixed(2)}
        </ThemedText>
        <ThemedText type="small" style={styles.footerText}>
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
    backgroundColor: '#f5a95c',
  },
  month: {
    color: '#ffffff',
    opacity: 0.85,
  },
  expense: {
    color: '#ffffff',
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
    color: '#ffffff',
    opacity: 0.9,
  },
});
