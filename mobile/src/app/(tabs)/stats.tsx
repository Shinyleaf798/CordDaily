import { Ionicons } from '@expo/vector-icons';
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

  const openCategory = (categoryId: string) =>
    router.push({ pathname: '/category-spending', params: { id: categoryId, month: formatMonthKey(month) } });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'left', 'right']}>
      {/* 没有标题行：底部 tab 已经亮着「统计」，月份和左右翻页都在下面那张卡的第一行，标题条只是重复，拿掉后第一屏多出一截 */}

      <ScrollView contentContainerStyle={styles.content}>
        {/* 翻月的控件在卡片里，跟日历页同一个位置同一个样子。
            趋势图是这张卡的下半（理由见 StatsSummaryCard）。柱子数跟着数据走：只有这个月有账就只画一根，
            攒够月份它自己会长到 6 根。一笔账都没有时不画——一张空图比没有图更难看懂 */}
        <StatsSummaryCard
          monthLabel={data.monthLabel}
          onPrevMonth={() => setMonth(shiftMonth(month, -1))}
          onNextMonth={() => setMonth(shiftMonth(month, 1))}
          onBackToCurrentMonth={data.isCurrentMonth ? undefined : () => setMonth(startOfMonth(new Date()))}
          expense={data.expense}
          deltaAmount={data.deltaAmount}
          deltaPercentage={data.deltaPercentage}
          previousExpense={data.previousExpense}
          trend={data.trend.length > 0 ? <MonthTrend bars={data.trend} /> : undefined}
        />

        <SectionHeader title="支出构成" />
        <CategoryBreakdown categories={data.categories} onSelect={openCategory} />

        {/* 待收回占满一行，点进报销页。原来旁边还有一格「标签 · 全部时间」——这一页说的都是本月，
            只有它是全部时间，标签已经整个搬进账单预览的标签页签（能按总 / 年 / 月 / 周切，见 DECISIONS.md） */}
        <ThemedView type="backgroundElement" style={styles.sideCard}>
          <Pressable onPress={() => router.push('/reimbursements')} style={styles.sideCell}>
            <View style={styles.sideText}>
              <ThemedText type="small" themeColor="textSecondary">
                待收回
              </ThemedText>
              <ThemedText style={[styles.sideValue, { color: theme.cardHighlight }]} numberOfLines={1}>
                {formatCurrency(data.pendingReimbursement)}
              </ThemedText>
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              垫出去还没收回的钱
            </ThemedText>
            <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
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
    // 不收圆角：日历和统计两页的卡片都是直角（2026-10-25 用户定的，见 DECISIONS.md）
    overflow: 'hidden',
    marginTop: 8,
  },
  sideCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  sideText: {
    flex: 1,
    gap: 2,
  },
  sideValue: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '700',
  },
});
