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
// 首页"近7天账单"和日历页的当天明细共用这一个，改这里两边一起变。
//
// 小计原先是红绿两色的 +RM5,000.00 / -RM412.90，现在改成「收 5,000.00」「支 412.90」：
// 是收是支由那个字说清楚，颜色就不用再兼职当标签了。数字一律用正文色
// （深色主题下是白的，白色主题下是黑的——写死 #ffffff 在白底卡片上会直接看不见），
// 跟下面每一行的金额同色，一天的小计和它的明细看起来才是一组数。
// 正负号不写了（"收/支"已经说了方向），RM 保留：小计和下面每一行的金额都带 RM，
// 一天的账看下来单位是齐的。代价是这一排变长，窄屏上 5 位数收入 + 长日期会顶到一起，
// 所以下面给左半边加了可压缩 + 单行省略，右边的数字任何时候都不许被挤掉。
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
        <ThemedText numberOfLines={1} style={styles.label}>
          {label}
        </ThemedText>
        {subLabel ? (
          <ThemedText numberOfLines={1} themeColor="textSecondary" style={styles.subLabel}>
            {subLabel}
          </ThemedText>
        ) : null}
      </View>

      {/* 收入是例外情况，没有就不占位；两个都为 0 的分组不会存在（分组是由当天的交易生成的） */}
      <View style={styles.totals}>
        {totalIncome > 0 ? (
          <View style={styles.total}>
            <ThemedText themeColor="textSecondary" style={styles.totalLabel}>
              收
            </ThemedText>
            <ThemedText style={styles.totalValue}>{formatCurrency(totalIncome)}</ThemedText>
          </View>
        ) : null}
        {totalExpense > 0 ? (
          <View style={styles.total}>
            <ThemedText themeColor="textSecondary" style={styles.totalLabel}>
              支
            </ThemedText>
            <ThemedText style={styles.totalValue}>{formatCurrency(totalExpense)}</ThemedText>
          </View>
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
    // 挤不下时先压这半边（日期少个"周三"还读得懂，金额少一位就错了）。
    // flexShrink 要配 minWidth: 0 才真的会缩，否则子元素的固有宽度会把它顶住
    flexShrink: 1,
    minWidth: 0,
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
    flexShrink: 0,
  },
  // 「收/支」和数字是一组，中间只留 3：贴太开会读成两个独立的东西
  total: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  totalLabel: {
    fontSize: 12,
    lineHeight: 20,
    fontWeight: '500',
  },
  totalValue: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
  },
});
