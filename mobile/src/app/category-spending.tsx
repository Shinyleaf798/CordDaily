import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryIcon } from '@/components/category/category-icon';
import { CategoryBreakdown } from '@/components/stats/category-breakdown';
import { TransactionDateGroupHeader } from '@/components/transaction/transaction-date-group-header';
import { TransactionDetailSheet } from '@/components/transaction/transaction-detail-sheet';
import { TransactionListItem } from '@/components/transaction/transaction-list-item';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { Spacing } from '@/constants/theme';
import { useCategoryDetailViewData } from '@/hooks/use-stats-view-data';
import { useTheme } from '@/hooks/use-theme';
import { parseMonthKey } from '@/utils/date';
import { formatAmount } from '@/utils/format';

/**
 * 分类下钻：`/category-spending?id=xxx&month=2026-09`。
 * 从统计页的支出构成点一行进来，看这个分类本月的子分类拆分和全部明细。
 *
 * 为什么是扁平路由 + 查询参数，不是 `/stats/category/[id]`：
 * 统计页本身是 `app/(tabs)/stats.tsx`，而路由组 `(tabs)` 不进 URL，所以它占的就是 `/stats`。
 * 再建一个 `app/stats/` 目录，两者都想当 `/stats`，是直接的冲突。
 * 而 `account-editor?id=`、`add?id=` 本来就是这个项目既有的写法，跟着走就好。
 *
 * 月份跟着参数走而不是自己存一份：从九月的统计页点进来，看到的必须是九月的餐饮。
 * 页面自己不给翻月——要换月份就退回去换，那里才是"选月份"这件事的主场。
 */
export default function CategorySpendingScreen() {
  const theme = useTheme();
  const { id, month: monthKey } = useLocalSearchParams<{ id?: string; month?: string }>();
  const month = parseMonthKey(monthKey);
  const data = useCategoryDetailViewData(id ?? '', month);

  const [detailId, setDetailId] = useState<string | null>(null);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['bottom', 'left', 'right']}>
      {/* 标题放分类名：这一页只讲一个分类，名字写在导航栏上，下面的卡片就不用再重复一遍 */}
      <Stack.Screen options={{ headerShown: true, headerTitle: data.name || '分类' }} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          {/* 分类名是这张卡的主语，月份是状语——原来这一行只有月份，
              读起来像"这是一张九月的卡"，而不是"这是餐饮这个分类" */}
          <View style={styles.titleRow}>
            <View style={[styles.iconWrap, { backgroundColor: theme.backgroundSelected }]}>
              <CategoryIcon icon={data.icon} size={18} />
            </View>
            <ThemedText style={styles.categoryName} numberOfLines={1}>
              {data.name || '分类'}
            </ThemedText>
          </View>

          <ThemedText themeColor="textSecondary" style={styles.monthLabel}>
            {data.monthLabel}支出
          </ThemedText>

          <View style={styles.amountRow}>
            <ThemedText style={[styles.currency, { color: theme.cardHighlight }]}>RM</ThemedText>
            <ThemedText style={styles.amount}>{formatAmount(data.total)}</ThemedText>
          </View>

          <View style={[styles.footer, { borderTopColor: theme.backgroundSelected }]}>
            <View style={[styles.chip, { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText style={[styles.chipText, { color: theme.cardHighlight }]}>
                {data.percentage.toFixed(1)}%
              </ThemedText>
            </View>
            <ThemedText themeColor="textSecondary" style={styles.footerNote}>
              占当月支出 · {data.count} 笔
            </ThemedText>
          </View>
        </View>

        {/* 没有子分类的分类（比如自己建的那些）整段不画，而不是画一个只有一行的图——
            一根占 100% 的条不提供任何信息 */}
        {data.children.length > 0 ? (
          <>
            <ThemedText type="small" themeColor="textSecondary" style={styles.sectionTitle}>
              子分类
            </ThemedText>
            {/* 复用主屏那张构成图：同一种图、同一套长度规则，只是层级不同。
                不传 onSelect——子分类没有下一层可钻，这里就是纯展示 */}
            <CategoryBreakdown categories={data.children} />
          </>
        ) : null}

        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionTitle}>
          明细
        </ThemedText>

        {data.dayGroups.length === 0 ? (
          <ThemedView type="backgroundElement" style={styles.emptyCard}>
            <ThemedText type="small" themeColor="textSecondary">
              这个月这个分类下还没有账单。
            </ThemedText>
          </ThemedView>
        ) : (
          <View style={styles.dayGroups}>
            {/* 一天一张卡，跟首页的近 7 天账单是同一个排法 */}
            {data.dayGroups.map((group) => (
              <ThemedView key={group.key} type="backgroundElement" style={styles.dayCard}>
                <TransactionDateGroupHeader
                  label={group.label}
                  subLabel={group.subLabel}
                  totalExpense={group.expense}
                  totalIncome={group.income}
                />
                {group.items.map((item, index) => (
                  <View key={item.id}>
                    {index > 0 ? (
                      <View style={[styles.rowDivider, { backgroundColor: theme.backgroundSelected }]} />
                    ) : null}
                    <View style={styles.itemWrap}>
                      <TransactionListItem {...item} surface="card" onPress={() => setDetailId(item.id)} />
                    </View>
                  </View>
                ))}
              </ThemedView>
            ))}
          </View>
        )}
      </ScrollView>

      {/* 全 App 同一个详情层。在这里删一笔，invalidateAll 会把分类聚合一起失效，
          上面那个合计和子分类的条跟着重算 */}
      {detailId ? <TransactionDetailSheet transactionId={detailId} onDismiss={() => setDetailId(null)} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.three,
    paddingTop: 12,
    paddingBottom: Spacing.six,
    gap: 10,
  },
  card: {
    borderRadius: 20,
    padding: 18,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryName: {
    flex: 1,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600',
  },
  monthLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    letterSpacing: 0.4,
    marginTop: 12,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 4,
  },
  currency: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '600',
  },
  amount: {
    fontSize: 36,
    lineHeight: 42,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  footerNote: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    marginLeft: 'auto',
  },
  sectionTitle: {
    letterSpacing: 0.3,
    marginTop: 8,
  },
  dayGroups: {
    gap: 10,
  },
  dayCard: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  // 分隔线从文字开始（缩进 66 = 16 内距 + 38 图标 + 12 间距），不切过图标
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 66,
  },
  itemWrap: {
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  emptyCard: {
    borderRadius: 16,
    padding: 16,
  },
});
