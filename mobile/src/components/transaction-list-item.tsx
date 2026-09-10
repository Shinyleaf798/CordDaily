import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TransactionListItemData = {
  id: string;
  icon: string;
  title: string;
  categoryLabel: string;
  time: string;
  note?: string;
  amount: number;
  type: 'INCOME' | 'EXPENSE';
};

// 单条交易行：首页"近7天账单"和以后的日历/账户详情页都复用这一个组件，只是喂给它的数据不同
export function TransactionListItem({ icon, title, categoryLabel, time, note, amount, type }: TransactionListItemData) {
  const theme = useTheme();
  const amountColor = type === 'INCOME' ? theme.income : theme.expense;
  const sign = type === 'INCOME' ? '+' : '-';

  return (
    <View style={styles.row}>
      <View style={[styles.iconWrap, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText style={styles.iconText}>{icon}</ThemedText>
      </View>

      <View style={styles.middle}>
        <ThemedText type="default">{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {categoryLabel} · {time}
          {note ? ` · ${note}` : ''}
        </ThemedText>
      </View>

      <ThemedText type="smallBold" style={{ color: amountColor }}>
        {sign}RM{amount.toFixed(2)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 20,
  },
  middle: {
    flex: 1,
    gap: 2,
  },
});
