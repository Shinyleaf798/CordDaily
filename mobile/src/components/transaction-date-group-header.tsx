import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type TransactionDateGroupHeaderProps = {
  label: string;
  totalExpense: number;
};

// 账单列表里每一天的分组标题：左边一条色条 + 日期，右边当天支出小计。
// 复用给首页"近7天账单"，以后日历/账户详情页按天分组也能用
export function TransactionDateGroupHeader({ label, totalExpense }: TransactionDateGroupHeaderProps) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <View style={[styles.bar, { backgroundColor: theme.expense }]} />
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        支 RM{totalExpense.toFixed(2)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
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
