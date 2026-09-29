import { StyleSheet, View } from 'react-native';

import { PaceBar } from '@/components/ui/pace-bar';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import type { BillTagStat } from '@/hooks/use-bill-overview-data';
import { useTheme } from '@/hooks/use-theme';
import { formatCurrency } from '@/utils/format';

type BillTagListProps = {
  tags: BillTagStat[];
};

/**
 * 标签统计：一个标签一行，条 + 金额 + 笔数 + 占比。
 *
 * 跟统计页那块标签汇总的区别只有一条，但很要紧：**这里是限定时间段的**。
 * 那一页写着「标签 · 全部时间」，因为「槟城旅行」圈的是一件横跨几个月的事，
 * 在"本月"那个语境里切开没有意义。这一页的主语本来就是"你选的那一段"，
 * 所以切得开，而且这正是它的用处——「2025 年在旅行上花了多少」在那一页问不出来。
 *
 * 排版跟分类统计那块一致（同一根条、同一个金额位置、同一个百分比宽度）：
 * 分类和标签是同一份钱的两种切法，切法不同不该长成两个样子。
 *
 * 标签没有层级，所以没有展开——这是它跟分类那块唯一的结构差别。
 */
export function BillTagList({ tags }: BillTagListProps) {
  const theme = useTheme();

  if (tags.length === 0) {
    return (
      <ThemedView type="backgroundElement" style={styles.emptyCard}>
        <ThemedText type="small" themeColor="textSecondary">
          这一段时间里没有用过标签。标签适合圈「一趟旅行」「一次装修」这种跨分类的事——
          记账时在底部那一行点「标签」就能加。
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      {tags.map((tag, index) => (
        <View key={tag.tag}>
          {index > 0 ? <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} /> : null}

          <View style={styles.row}>
            <View style={styles.body}>
              <View style={styles.titleRow}>
                <ThemedText style={styles.name} numberOfLines={1}>
                  {tag.tag}
                </ThemedText>
                <ThemedText style={styles.value}>{formatCurrency(tag.total)}</ThemedText>
              </View>

              <PaceBar
                percentage={tag.relative}
                height={6}
                color={theme.cardHighlight}
                trackColor={theme.backgroundSelected}
                markerColor={theme.cardHighlight}
              />

              <ThemedText themeColor="textSecondary" style={styles.meta}>
                {tag.count} 笔 · {tag.percentage.toFixed(1)}%
              </ThemedText>
            </View>
          </View>
        </View>
      ))}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  emptyCard: {
    borderRadius: 16,
    padding: 16,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  row: {
    paddingVertical: 12,
  },
  body: {
    gap: 5,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  name: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  value: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  meta: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
  },
});
