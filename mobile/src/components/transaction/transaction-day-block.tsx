import { StyleSheet, View } from 'react-native';

import { TransactionDateGroupHeader } from '@/components/transaction/transaction-date-group-header';
import { TransactionListItem } from '@/components/transaction/transaction-list-item';
import { useTheme } from '@/hooks/use-theme';
import type { TransactionDayGroup } from '@/utils/transaction-view';

type TransactionDayBlockProps = {
  group: TransactionDayGroup;
  onSelect: (id: string) => void;
};

/**
 * 「一天的账」那一块：日期 + 当天小计的带子，底下一行一笔，中间用细线分开。
 *
 * **它不带底色也不带圆角**——谁托着它是调用方的事。这是从 TransactionDayCard 里拆出来的：
 * 那个件是"一天 = 一张卡"，而首页现在要的是"好几天挤在同一张大卡里"，
 * 两者只有外面那层壳不一样，里面一模一样。壳留给调用方决定，这一块只管排版。
 *
 * 分隔线从文字开始（缩进 66 = 16 内距 + 38 图标宽 + 12 间距），不切过图标——
 * 切过去会把一列图标劈成两半，看着像表格。
 */
export function TransactionDayBlock({ group, onSelect }: TransactionDayBlockProps) {
  const theme = useTheme();

  return (
    <View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 66,
  },
  itemWrap: {
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
});
