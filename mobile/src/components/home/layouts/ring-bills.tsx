import { StyleSheet, View } from 'react-native';

import { BillsSectionTitle } from '@/components/home/bills-section-title';
import { TransactionListItem } from '@/components/transaction/transaction-list-item';
import { ThemedText } from '@/components/ui/themed-text';
import type { HomeBillsProps } from '@/components/home/layouts/types';
import { useTheme } from '@/hooks/use-theme';
import { formatAmount } from '@/utils/format';

// 下半「金环」：账单直接铺在页面底色上，没有卡片，只用一条细线分隔。
// 同样的行数比一天一张卡矮一截，代价是天与天的界线弱一些。
export function RingBills({ data, onSelectTransaction }: HomeBillsProps) {
  const theme = useTheme();

  return (
    <View>
      <BillsSectionTitle />

      {data.dayGroups.length === 0 ? (
        <ThemedText type="default" themeColor="textSecondary" style={styles.empty}>
          最近还没有账单，点底部的 + 记一笔吧。
        </ThemedText>
      ) : (
        data.dayGroups.map((group) => (
          <View key={group.key}>
            <View style={styles.dayHeader}>
              <ThemedText style={[styles.dayLabel, { color: theme.cardHighlight }]}>
                {group.label} · {group.subLabel}
              </ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.daySummary}>
                {group.expense > 0 ? `支出 ${formatAmount(group.expense)}` : ''}
                {group.income > 0 ? `${group.expense > 0 ? ' · ' : ''}收入 ${formatAmount(group.income)}` : ''}
              </ThemedText>
            </View>
            {group.items.map((item) => (
              <View key={item.id} style={[styles.rowWrap, { borderTopColor: theme.backgroundSelected }]}>
                <TransactionListItem {...item} surface="page" onPress={() => onSelectTransaction(item.id)} />
              </View>
            ))}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    marginTop: 14,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 14,
    paddingBottom: 6,
  },
  dayLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 1,
  },
  daySummary: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  // 账单行直接铺在页面底色上，靠一条上边线分隔，没有卡片
  rowWrap: {
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
