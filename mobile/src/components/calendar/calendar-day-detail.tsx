import { StyleSheet, View } from 'react-native';

import { TransactionDateGroupHeader } from '@/components/transaction/transaction-date-group-header';
import { TransactionListItem } from '@/components/transaction/transaction-list-item';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import type { CalendarSelection } from '@/hooks/use-calendar-view-data';
import { useTheme } from '@/hooks/use-theme';

type CalendarDayDetailProps = {
  selection: CalendarSelection;
  onSelectTransaction: (id: string) => void;
};

/**
 * 选中那天的账单明细，就地展开在日历下面，不跳页。
 *
 * 卡片长相跟首页的"当天卡片"完全一样（同一个分组标题 + 同一种行），是故意的：
 * 一笔账在首页和在日历里看应该是同一个东西，换个页面就换个样子只会让人怀疑是不是两条记录。
 *
 * 没有账单的那天也照样渲染这张卡（而不是整块消失）：日历上那格已经被点亮了，
 * 下面却什么都没有的话，看起来像没点中。留一张卡明确回答"这天确实没花钱"。
 */
export function CalendarDayDetail({ selection, onSelectTransaction }: CalendarDayDetailProps) {
  const theme = useTheme();
  const isEmpty = selection.items.length === 0;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <TransactionDateGroupHeader
        label={selection.label}
        subLabel={selection.subLabel}
        totalExpense={selection.expense}
        totalIncome={selection.income}
      />

      {isEmpty ? (
        <View style={styles.empty}>
          <ThemedText themeColor="textSecondary" style={styles.emptyText}>
            这天没有账单
          </ThemedText>
        </View>
      ) : (
        selection.items.map((item, index) => (
          <View key={item.id}>
            {/* 分隔线从文字开始（缩进 66 = 16 内距 + 38 图标 + 12 间距），不切过图标，同首页 */}
            {index > 0 ? <View style={[styles.rowDivider, { backgroundColor: theme.backgroundSelected }]} /> : null}
            <View style={styles.itemWrap}>
              <TransactionListItem {...item} surface="card" onPress={() => onSelectTransaction(item.id)} />
            </View>
          </View>
        ))
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  empty: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 66,
  },
  itemWrap: {
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
});
