import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryBreakdown } from '@/components/stats/category-breakdown';
import { StatsSummaryCard } from '@/components/stats/stats-summary-card';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { Spacing } from '@/constants/theme';
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
 * 近 6 个月趋势图还没做——项目才开始两周，那张图现在会画出五根空柱，
 * 等真有几个月历史了再补（见 DECISIONS.md）。
 */
export default function StatsScreen() {
  const theme = useTheme();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const data = useStatsViewData(month);

  const openCategory = (categoryId: string) =>
    router.push({ pathname: '/category-spending', params: { id: categoryId, month: formatMonthKey(month) } });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="pageTitle">统计</ThemedText>

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

        <SectionHeader title="支出构成" />
        <CategoryBreakdown categories={data.categories} onSelect={openCategory} />

        {/* 标签是全部时间的，其余都是本月——标题里写明，不让这个差别悄悄存在。
            「槟城旅行」这种标签圈的是横跨几个月的一件事，切成"9月那部分"没有意义 */}
        <SectionHeader
          title="标签 · 全部时间"
          action={data.tagCount > data.tags.length ? `全部 ${data.tagCount} 个` : undefined}
          onAction={() => router.push('/tags')}
        />
        {data.tags.length === 0 ? (
          <EmptyCard text="还没有用过标签。标签适合圈「一趟旅行」「一次装修」这种跨分类的事。" />
        ) : (
          <ThemedView type="backgroundElement" style={styles.list}>
            {data.tags.map((tag, index) => (
              <Pressable key={tag.tag} onPress={() => router.push('/tags')}>
                <View style={[styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.backgroundSelected }]}>
                  <View style={styles.rowText}>
                    <ThemedText style={styles.rowTitle} numberOfLines={1}>
                      {tag.tag}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {tag.count} 笔
                    </ThemedText>
                  </View>
                  <ThemedText style={styles.rowValue}>{formatCurrency(tag.total)}</ThemedText>
                  <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
                </View>
              </Pressable>
            ))}
          </ThemedView>
        )}

        <SectionHeader title="待收回" />
        <Pressable onPress={() => router.push('/reimbursements')}>
          <ThemedView type="backgroundElement" style={styles.list}>
            <View style={styles.row}>
              <View style={styles.rowText}>
                <ThemedText style={styles.rowTitle}>垫出去还没收回的钱</ThemedText>
              </View>
              <ThemedText style={[styles.rowValue, { color: theme.cardHighlight }]}>
                {formatCurrency(data.pendingReimbursement)}
              </ThemedText>
              <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
            </View>
          </ThemedView>
        </Pressable>
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

function EmptyCard({ text }: { text: string }) {
  return (
    <ThemedView type="backgroundElement" style={styles.emptyCard}>
      <ThemedText type="small" themeColor="textSecondary">
        {text}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.three,
    paddingTop: 12,
    paddingBottom: Spacing.six,
    gap: 10,
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
  list: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  rowTitle: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
  },
  rowValue: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
  },
  emptyCard: {
    borderRadius: 16,
    padding: 16,
  },
});
