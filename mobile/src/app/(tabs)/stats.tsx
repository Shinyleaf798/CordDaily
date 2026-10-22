import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryBreakdown } from '@/components/stats/category-breakdown';
import { MonthTrend } from '@/components/stats/month-trend';
import { StatsSummaryCard } from '@/components/stats/stats-summary-card';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { ScreenBottomInset, ScreenGap, ScreenPadding } from '@/constants/theme';
import { useStatsViewData } from '@/hooks/use-stats-view-data';
import { useTheme } from '@/hooks/use-theme';
import { formatMonthKey, shiftMonth, startOfMonth } from '@/utils/date';
import { formatCurrency } from '@/utils/format';

/**
 * 统计页：这个 App 已经在记、但之前没有任何地方读得出来的那批数据。
 *
 * 四块内容的排序是有意的——锚点（本月花了多少、比上月多还是少）→ 构成（花在什么上）
 * → 两个侧面（跨分类的标签、垫出去还没收回的钱）。越往下越是"顺便看一眼"。
 *
 * 它接替了原来的「资产」tab。账户在这个 App 里只是"我用什么付的"这么一个标签，
 * 余额准不准无关紧要，所以那一页撑不起一个 tab，已经并进 我的 → 账本（见 DECISIONS.md）。
 *
 * 页面自己只管一件事：在看哪个月。数字全在 useStatsViewData 里算。
 */
export default function StatsScreen() {
  const theme = useTheme();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const data = useStatsViewData(month);
  // 标签那格只放用得最多的一个，其余的数一下，点进去看全
  const topTag = data.tags[0];

  const openCategory = (categoryId: string) =>
    router.push({ pathname: '/category-spending', params: { id: categoryId, month: formatMonthKey(month) } });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'left', 'right']}>
      {/* 没有标题行：底部 tab 已经亮着「统计」，月份和左右翻页都在下面那张卡的第一行，标题条只是重复，拿掉后第一屏多出一截 */}

      <ScrollView contentContainerStyle={styles.content}>
        {/* 翻月的控件在卡片里，跟日历页同一个位置同一个样子 */}
        <StatsSummaryCard
          monthLabel={data.monthLabel}
          onPrevMonth={() => setMonth(shiftMonth(month, -1))}
          onNextMonth={() => setMonth(shiftMonth(month, 1))}
          onBackToCurrentMonth={data.isCurrentMonth ? undefined : () => setMonth(startOfMonth(new Date()))}
          expense={data.expense}
          deltaAmount={data.deltaAmount}
          deltaPercentage={data.deltaPercentage}
          previousExpense={data.previousExpense}
        />

        {/* 趋势图的柱子数跟着数据走：只有这个月有账就只画一根，攒够月份它自己会长到 6 根。
            一笔账都没有时整段不画——一张空图比没有图更难看懂 */}
        {data.trend.length > 0 ? (
          <>
            <SectionHeader title="月度趋势" />
            <MonthTrend bars={data.trend} />
          </>
        ) : null}

        <SectionHeader title="支出构成" />
        <CategoryBreakdown categories={data.categories} onSelect={openCategory} />

        {/* 待收回和标签并排压成一张卡：两样都是"顺便看一眼"的侧面，各占一整段太重了。
            原来标签是一张列表、待收回是单独一行，现在各留一个数，点进去才看全
            （这一块是从「账本」样式的设计稿里搬回经典样式的，见 DECISIONS.md）。
            标签那格标明「全部时间」：其余都是本月，不让这个差别悄悄存在 */}
        <ThemedView type="backgroundElement" style={styles.sideCard}>
          <Pressable
            onPress={() => router.push('/reimbursements')}
            style={[styles.sideCell, { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: theme.backgroundSelected }]}>
            <ThemedText type="small" themeColor="textSecondary">
              待收回
            </ThemedText>
            <ThemedText style={[styles.sideValue, { color: theme.cardHighlight }]} numberOfLines={1}>
              {formatCurrency(data.pendingReimbursement)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              垫出去还没收回的钱
            </ThemedText>
          </Pressable>
          <Pressable onPress={() => router.push('/tags')} style={styles.sideCell}>
            <ThemedText type="small" themeColor="textSecondary">
              标签 · 全部时间
            </ThemedText>
            {topTag ? (
              <>
                <ThemedText style={styles.sideTag} numberOfLines={1}>
                  {topTag.tag}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {formatCurrency(topTag.total)}
                  {data.tagCount > 1 ? ` · 还有 ${data.tagCount - 1} 个` : ''}
                </ThemedText>
              </>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                还没用过标签，适合圈「一趟旅行」这种跨分类的事
              </ThemedText>
            )}
          </Pressable>
        </ThemedView>
      </ScrollView>
    </SafeAreaView>
  );
}

// 三个分区的标题长得一样，就地定义一个小组件而不是各写一遍。
// 不抽到 components/ 下面：它不认识任何业务概念，但也只有这一页在用，
// 等第二个页面需要它的时候再搬进 ui/（CLAUDE.md 的归类规则：先看谁在用）
function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.sectionTitle}>
        {title}
      </ThemedText>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <ThemedText type="linkPrimary">{action} ›</ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: ScreenPadding,
    paddingTop: ScreenGap,
    paddingBottom: ScreenBottomInset,
    gap: ScreenGap,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  sectionTitle: {
    letterSpacing: 0.3,
  },
  sideCard: {
    flexDirection: 'row',
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 8,
  },
  sideCell: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 2,
  },
  sideValue: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '700',
  },
  sideTag: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    marginTop: 3,
  },
});
