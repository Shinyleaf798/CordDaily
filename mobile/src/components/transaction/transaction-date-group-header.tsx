import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { formatCurrency } from '@/utils/format';

type TransactionDateGroupHeaderProps = {
  /** 主标签：今天 / 昨天 / 9月13日 */
  label: string;
  /** 副标签：主标签是"今天"时补上具体日期，否则补星期 */
  subLabel?: string;
  totalExpense: number;
  totalIncome: number;
};

// 账单列表里每一天的分组标题：左边一条色条 + 日期，右边当天收支小计。
// 现在它是每个"当天卡片"的头部（不再是列表中间的一条），所以不带自己的圆角，由外面的卡片裁切。
// 复用给首页"近7天账单"，以后日历/账户详情页按天分组也能用。
export function TransactionDateGroupHeader({
  label,
  subLabel,
  totalExpense,
  totalIncome,
}: TransactionDateGroupHeaderProps) {
  const theme = useTheme();

  return (
    <View style={[styles.row, { backgroundColor: theme.cardHighlight + '14' }]}>
      <View style={styles.left}>
        <View style={[styles.bar, { backgroundColor: theme.cardHighlight }]} />
        <ThemedText style={styles.label}>{label}</ThemedText>
        {subLabel ? (
          <ThemedText themeColor="textSecondary" style={styles.subLabel}>
            {subLabel}
          </ThemedText>
        ) : null}
      </View>

      {/* 收入是例外情况，没有就不占位；两个都为 0 的分组不会存在（分组是由当天的交易生成的） */}
      <View style={styles.totals}>
        {totalIncome > 0 ? (
          <ThemedText style={[styles.total, { color: theme.income }]}>+{formatCurrency(totalIncome)}</ThemedText>
        ) : null}
        {totalExpense > 0 ? (
          <ThemedText style={[styles.total, { color: theme.expense }]}>-{formatCurrency(totalExpense)}</ThemedText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bar: {
    width: 3,
    height: 13,
    borderRadius: 2,
  },
  label: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  subLabel: {
    fontSize: 12,
    lineHeight: 20,
    fontWeight: '500',
  },
  totals: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  total: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
  },
});
