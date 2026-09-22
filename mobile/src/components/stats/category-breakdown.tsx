import { Pressable, StyleSheet, View } from 'react-native';

import { CategoryIcon } from '@/components/category/category-icon';
import { PaceBar } from '@/components/ui/pace-bar';
import { ThemedText } from '@/components/ui/themed-text';
import type { CategorySlice } from '@/hooks/use-stats-view-data';
import { useTheme } from '@/hooks/use-theme';
import { formatCurrency } from '@/utils/format';

type CategoryBreakdownProps = {
  categories: CategorySlice[];
  /**
   * 点一行下钻。不传就是纯展示，连按下的反馈都没有——
   * 下钻页里的子分类构成用的就是这个形态（子分类没有下一层可钻）
   */
  onSelect?: (categoryId: string) => void;
};

/**
 * 支出构成：一个分类一行，图标 + 名字 + 条 + 金额 + 占比。
 *
 * **所有条用同一个颜色**，身份由图标和名字承担。给五个分类配五种颜色是"按排名上色"——
 * 换一个月份、换一个筛选条件，同一个分类就换一种颜色，颜色反而成了噪音；
 * 而且五种能彼此区分、在三套主题上都成立、还对色盲友好的颜色，是要单独配一套色板的事。
 * 单色的副作用好处是：三套主题各自的 cardHighlight 直接拿来用，统计页不需要自己的颜色。
 *
 * 条的长度是"相对第一名"不是"占总支出"（见 buildStatsViewData 里的说明）。
 *
 * 用 PaceBar 而不是新写一个条：它不传 markerPercentage 时就是一条纯粹的轨道 + 渐变填充，
 * 正好是这里要的东西。那个组件的注释本来就写着"不认识预算这个概念，之后别处也能直接复用"。
 */
export function CategoryBreakdown({ categories, onSelect }: CategoryBreakdownProps) {
  const theme = useTheme();

  if (categories.length === 0) {
    return (
      <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="small" themeColor="textSecondary">
          这个月还没有支出，记一笔之后这里会按分类拆开。
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      {categories.map((slice) => (
        // 「其他」是个聚合出来的假分类，没有 id 可以下钻——跟没传 onSelect 一样不给 onPress，
        // 免得用户点了没反应以为坏了
        <Pressable
          key={slice.id}
          onPress={onSelect && !slice.isOther ? () => onSelect(slice.id) : undefined}
          style={styles.row}>
          <View style={[styles.iconWrap, { backgroundColor: theme.backgroundSelected }]}>
            {slice.isOther ? (
              <ThemedText themeColor="textSecondary" style={styles.otherMark}>
                ···
              </ThemedText>
            ) : (
              <CategoryIcon icon={slice.icon} size={17} />
            )}
          </View>

          <View style={styles.body}>
            <View style={styles.titleRow}>
              <ThemedText style={styles.name} numberOfLines={1}>
                {slice.name}
              </ThemedText>
              <ThemedText style={styles.value}>{formatCurrency(slice.total)}</ThemedText>
            </View>

            <PaceBar
              percentage={slice.relative}
              height={6}
              color={theme.cardHighlight}
              trackColor={theme.backgroundSelected}
              markerColor={theme.cardHighlight}
            />
          </View>

          <ThemedText themeColor="textSecondary" style={styles.percentage}>
            {slice.percentage.toFixed(1)}%
          </ThemedText>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    gap: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otherMark: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '700',
  },
  // 中间这一栏要能被挤窄：分类名长的时候压的是名字，不是右边的金额和百分比
  body: {
    flex: 1,
    minWidth: 0,
    gap: 6,
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
  // 固定宽度 + 右对齐：几行的百分比要对得齐，不能跟着数字位数左右浮动
  percentage: {
    width: 44,
    textAlign: 'right',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
});
