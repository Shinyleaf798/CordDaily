import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type TransactionDateGroupHeaderProps = {
  label: string;
  totalExpense: number;
  totalIncome: number;
};

// 账单列表里每一天的分组标题：左边一条色条 + 日期，右边当天支出/收入小计。
// 复用给首页"近7天账单"，以后日历/账户详情页按天分组也能用
export function TransactionDateGroupHeader({ label, totalExpense, totalIncome }: TransactionDateGroupHeaderProps) {
  const theme = useTheme();

  return (
    <View style={[styles.row, { backgroundColor: theme.cardHighlight + '26' }]}>
      <View style={styles.left}>
        <View style={[styles.bar, { backgroundColor: theme.cardHighlight }]} />
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        支出 RM{totalExpense.toFixed(2)}
        {totalIncome > 0 ? ` · 收入 RM${totalIncome.toFixed(2)}` : ''}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  bar: {
    width: 3,
    height: 12,
    borderRadius: 2,
  },
});
