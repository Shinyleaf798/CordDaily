import { StyleSheet, View } from 'react-native';

import type { CalendarDayProps } from '@/components/calendar/layouts/types';
import { TransactionListItem } from '@/components/transaction/transaction-list-item';
import { ThemedText } from '@/components/ui/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { formatAmount } from '@/utils/format';

/**
 * 下半 · 热力：通栏明细，铺在页面底色上，跟上半的热力月历一样不用卡片。
 *
 * 一条细线跟上面的月历隔开；标题一行左边是哪天，右边是这天几笔、花了多少——
 * 卡片版把合计放在分组标题里，这里没有卡顶那条带子，合计就跟标题挤一行
 */
export function HeatDay({ selection, onSelectTransaction }: CalendarDayProps) {
  const theme = useTheme();
  const rule = { borderTopColor: theme.divider };

  if (!selection) {
    return (
      <View style={[styles.wrap, rule]}>
        <ThemedText themeColor="textSecondary" style={styles.hint}>
          点一天查看当天账单
        </ThemedText>
      </View>
    );
  }

  const count = selection.items.length;
  const totals = [
    `${count} 笔`,
    selection.expense > 0 ? `支出 ${formatAmount(selection.expense)}` : null,
    selection.income > 0 ? `收入 ${formatAmount(selection.income)}` : null,
  ].filter(Boolean);

  return (
    <View style={[styles.wrap, rule]}>
      <View style={styles.head}>
        <ThemedText style={styles.title} numberOfLines={1}>
          {selection.label} · {selection.subLabel}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {totals.join(' · ')}
        </ThemedText>
      </View>

      {count === 0 ? (
        <ThemedText themeColor="textSecondary" style={styles.hint}>
          这天没有账单
        </ThemedText>
      ) : (
        selection.items.map((item, index) => (
          <View key={item.id}>
            {index > 0 ? <View style={[styles.divider, { backgroundColor: theme.divider }]} /> : null}
            <View style={styles.item}>
              <TransactionListItem {...item} surface="page" onPress={() => onSelectTransaction(item.id)} />
            </View>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
    paddingHorizontal: 12,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 14,
    paddingBottom: 4,
  },
  title: {
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
  },
  item: {
    paddingVertical: 7,
  },
  // 分隔线从文字开始：38 图标 + 12 间距，不切过图标（同首页通栏那套）
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 50,
  },
  hint: {
    paddingVertical: 20,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
});
