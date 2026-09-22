import { ScrollView, StyleSheet, View } from 'react-native';

import { BudgetProgressCard } from '@/components/home/budget-progress-card';
import { MonthSummaryCard } from '@/components/home/month-summary-card';
import { TransactionDateGroupHeader } from '@/components/transaction/transaction-date-group-header';
import { TransactionListItem } from '@/components/transaction/transaction-list-item';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { Spacing } from '@/constants/theme';
import type { HomeLayoutProps } from '@/components/home/layouts/types';
import { useTheme } from '@/hooks/use-theme';

// 布局 A「节奏条」：月度总览卡 + 预算节奏卡 + 近7天账单（一天一张卡）。
// 全部信息都装在卡片里，层次靠卡片边界交代，是两套布局里更稳、更耐看的那个。
export function PaceLayout({ data, onSelectTransaction }: HomeLayoutProps) {
  const theme = useTheme();

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {/* 标题行右侧刻意留空，以后放搜索和图表入口；月份因此自己占一行 */}
      <View style={styles.headerRow}>
        <ThemedText type="pageTitle">首页</ThemedText>
      </View>

      <View style={styles.monthRow}>
        <View style={[styles.monthChip, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText style={[styles.monthChipText, { color: theme.cardHighlight }]}>{data.monthLabel}</ThemedText>
        </View>
      </View>

      <MonthSummaryCard income={data.income} expense={data.expense} balance={data.balance} />
      <BudgetProgressCard {...data} />

      <ThemedText type="subtitle" style={styles.sectionTitle}>
        近7天账单
      </ThemedText>

      {data.dayGroups.length === 0 ? (
        <ThemedText type="default" themeColor="textSecondary">
          最近还没有账单，点底部的 + 记一笔吧。
        </ThemedText>
      ) : (
        <View style={styles.dayGroups}>
          {data.dayGroups.map((group) => (
            // 一天一张卡，而不是一整块列表里插分隔线：天与天之间的界线靠卡片间距交代，
            // 卡内的交易之间才用细线，层级比"全是同一种线"清楚
            <ThemedView key={group.key} type="backgroundElement" style={styles.dayCard}>
              <TransactionDateGroupHeader
                label={group.label}
                subLabel={group.subLabel}
                totalExpense={group.expense}
                totalIncome={group.income}
              />
              {group.items.map((item, itemIndex) => (
                <View key={item.id}>
                  {itemIndex > 0 ? (
                    // 分隔线从文字开始（缩进 66 = 16 内距 + 38 图标 + 12 间距），不切过图标
                    <View style={[styles.rowDivider, { backgroundColor: theme.backgroundSelected }]} />
                  ) : null}
                  <View style={styles.itemWrap}>
                    <TransactionListItem {...item} surface="card" onPress={() => onSelectTransaction(item.id)} />
                  </View>
                </View>
              ))}
            </ThemedView>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.three,
    paddingTop: 12,
    paddingBottom: Spacing.six,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // 用一个 row 包着 chip，chip 才不会被拉满整行宽
  monthRow: {
    flexDirection: 'row',
  },
  monthChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  monthChipText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 17,
    lineHeight: 24,
  },
  dayGroups: {
    gap: 10,
  },
  dayCard: {
    borderRadius: 16,
    overflow: 'hidden',
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
