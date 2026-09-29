import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CategoryIcon } from '@/components/category/category-icon';
import { PaceBar } from '@/components/ui/pace-bar';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { chartColorAt } from '@/constants/chart-palette';
import type { CategoryStatGroup } from '@/hooks/use-bill-overview-data';
import { useChartPalette } from '@/hooks/use-chart-palette';
import type { CategorySlice } from '@/hooks/use-stats-view-data';
import { useTheme } from '@/hooks/use-theme';
import { formatCurrency } from '@/utils/format';

type CategoryStatListProps = {
  categories: CategoryStatGroup[];
};

/**
 * 分类统计：顶层分类一行，点一行**就地展开**它的子分类。
 *
 * 跟统计页那张 CategoryBreakdown 的区别，是这里多了"展开"这件事，而不是多了几行：
 * 那一屏的构成图点一行会**跳到另一个页面**（分类下钻），因为那一页还要给你当月明细；
 * 这一页你本来就是进来翻的，跳出去再回来会丢掉刚选好的时间段和滚动位置。
 * 就地展开让"餐饮里到底是外卖还是聚餐"这个问题在原地就能答完。
 *
 * 展开状态存在组件自己身上，不往上提：它是纯粹的界面状态（哪一行现在是开的），
 * 换时间段、换收支类型都不需要保留它——那时候展开的那一行讲的已经是另一段数据了。
 *
 * **这张列表同时是上面那个环形图的图例**：每一行左边那枚小圆点跟环上对应那一段同色，
 * 前五名各一色、其余统一是「其他」那个灰。条本身也跟着上色。
 *
 * 这是唯一一处偏离"构成图全用同一个颜色"那条老规矩的地方，而且是被环形图逼出来的：
 * 一个圈上六段颜色如果一样，那个圈什么都没说。既然圈上已经有颜色了，
 * 列表这边不跟着上色，人就没法把圈上那一段和某一行对上——那才是真正的噪音。
 * 身份仍然由图标和名字承担，颜色只负责"圈上那段 = 这一行"这一件事
 * （色板怎么来的、为什么按名次而不是按分类身份上色，见 constants/chart-palette）。
 *
 * 子分类的条颜色淡一档，表示它们是"这一行内部的拆分"，不跟外面那些条比长短。
 */
export function CategoryStatList({ categories }: CategoryStatListProps) {
  const theme = useTheme();
  const palette = useChartPalette();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (categories.length === 0) {
    return (
      <ThemedView type="backgroundElement" style={styles.emptyCard}>
        <ThemedText type="small" themeColor="textSecondary">
          这一段时间还没有账，换个时间段或者记一笔试试。
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      {categories.map((category, index) => {
        const isExpanded = expandedId === category.id;
        const canExpand = category.children.length > 0;
        // 名次即色号，跟环上那一段对应。第六名之后统一是「其他」那个灰——
        // 环上它们本来就被并成一段了
        const color = chartColorAt(palette, index);

        return (
          <View key={category.id}>
            {index > 0 ? <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} /> : null}

            {/* 没有子分类的行不给 onPress：点了没反应会被当成坏了 */}
            <Pressable
              onPress={canExpand ? () => setExpandedId(isExpanded ? null : category.id) : undefined}
              style={styles.row}>
              <View style={styles.iconWrap}>
                <CategoryIcon icon={category.icon} size={17} />
                {/* 色点贴在图标左下角，不单独占一列：一列小圆点会在图标和文字之间
                    插进第三条纵向节奏，而它要说的只是"这一行 = 圈上那一段" */}
                <View style={[styles.swatch, { backgroundColor: color, borderColor: theme.backgroundElement }]} />
              </View>

              <View style={styles.body}>
                <View style={styles.titleRow}>
                  <ThemedText style={styles.name} numberOfLines={1}>
                    {category.name}
                  </ThemedText>
                  <ThemedText style={styles.value}>{formatCurrency(category.total)}</ThemedText>
                </View>

                <PaceBar
                  percentage={category.relative}
                  height={6}
                  color={color}
                  trackColor={theme.backgroundSelected}
                  markerColor={color}
                />

                <View style={styles.metaRow}>
                  <ThemedText themeColor="textSecondary" style={styles.meta}>
                    {category.count} 笔 · {category.percentage.toFixed(1)}%
                  </ThemedText>
                  {canExpand ? (
                    <ThemedText themeColor="textSecondary" style={styles.meta}>
                      {category.children.length} 个子分类
                    </ThemedText>
                  ) : null}
                </View>
              </View>

              {/* 箭头只在有得展开时出现，并且转向——它是这一行"还有下一层"的唯一提示 */}
              {canExpand ? (
                <Ionicons
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={15}
                  color={theme.textSecondary}
                />
              ) : (
                <View style={styles.arrowPlaceholder} />
              )}
            </Pressable>

            {isExpanded ? (
              <View style={styles.children}>
                {category.children.map((child) => (
                  <ChildRow key={child.id} child={child} color={color} />
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
    </ThemedView>
  );
}

// 子分类那一行：比父行窄一档、缩进对齐父行的文字，条也更细。
// 视觉份量比父行轻是有意的——它们是父行的拆分，不是跟父行并列的东西
function ChildRow({ child, color }: { child: CategorySlice; color: string }) {
  const theme = useTheme();

  return (
    <View style={styles.childRow}>
      <CategoryIcon icon={child.icon} size={15} />
      <View style={styles.childBody}>
        <View style={styles.titleRow}>
          <ThemedText themeColor="textSecondary" style={styles.childName} numberOfLines={1}>
            {child.name}
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.childValue}>
            {formatCurrency(child.total)}
          </ThemedText>
        </View>
        <PaceBar
          percentage={child.relative}
          height={4}
          // 用父行那个颜色淡一档：同色说明"还在这个分类里面"，
          // 淡一档说明"这一根的参照系是这个分类内部，不跟外面那些比长短"
          color={color + 'AA'}
          trackColor={theme.backgroundSelected}
          markerColor={color}
        />
      </View>
      <ThemedText themeColor="textSecondary" style={styles.childPercentage}>
        {child.percentage.toFixed(0)}%
      </ThemedText>
    </View>
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
    // 从文字开始，不切过图标（同账单列表里那条线）
    marginLeft: 40,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  iconWrap: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 描边跟卡片同色，于是色点和图标之间永远有一圈底色隔开，不会糊成一团
  swatch: {
    position: 'absolute',
    left: -2,
    bottom: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
  },
  body: {
    flex: 1,
    minWidth: 0,
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
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  meta: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
  },
  // 没有箭头的行也要占住那个位置，否则那几行的条会比别的行长一截
  arrowPlaceholder: {
    width: 15,
  },
  children: {
    // 缩进到父行文字的起点（30 图标 + 10 间距），子分类因此看起来是挂在父行下面的
    paddingLeft: 40,
    paddingBottom: 12,
    gap: 10,
  },
  childRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  childBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  childName: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  childValue: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  // 固定宽度右对齐，几行的百分比要对得齐
  childPercentage: {
    width: 34,
    textAlign: 'right',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
  },
});
