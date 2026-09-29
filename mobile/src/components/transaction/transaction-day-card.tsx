import { StyleSheet, View } from 'react-native';

import { TransactionDateGroupHeader } from '@/components/transaction/transaction-date-group-header';
import { TransactionListItem } from '@/components/transaction/transaction-list-item';
import { ThemedView } from '@/components/ui/themed-view';
import { useTheme } from '@/hooks/use-theme';
import type { TransactionDayGroup } from '@/utils/transaction-view';

type TransactionDayCardProps = {
  group: TransactionDayGroup;
  onSelect: (id: string) => void;
};

/**
 * 「一天的账」那张卡：头部是日期 + 当天小计，底下一行一笔，中间用细线分开。
 *
 * 这份排版原来在首页布局 A 和分类下钻页里各写了一遍，一字不差；搜索结果和账单预览也要它。
 * 抽出来之后，"天与天之间靠卡片间距分、卡内的交易之间才用细线"这条层级规则只有一处定义。
 *
 * 分隔线从文字开始（缩进 66 = 16 内距 + 38 图标宽 + 12 间距），不切过图标——
 * 切过去会把一列图标劈成两半，看着像表格。
 */
export function TransactionDayCard({ group, onSelect }: TransactionDayCardProps) {
  const theme = useTheme();

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <TransactionDateGroupHeader
        label={group.label}
        subLabel={group.subLabel}
        totalExpense={group.expense}
        totalIncome={group.income}
      />
      {group.items.map((item, index) => (
        <View key={item.id}>
          {index > 0 ? <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} /> : null}
          <View style={styles.itemWrap}>
            <TransactionListItem {...item} surface="card" onPress={() => onSelect(item.id)} />
          </View>
        </View>
      ))}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 66,
  },
  itemWrap: {
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
});
