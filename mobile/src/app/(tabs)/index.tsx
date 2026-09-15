import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BudgetProgressCard } from '@/components/home/budget-progress-card';
import { MonthSummaryCard } from '@/components/home/month-summary-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TransactionDateGroupHeader } from '@/components/transaction-date-group-header';
import { TransactionListItem, type TransactionListItemData } from '@/components/transaction-list-item';
import { Spacing } from '@/constants/theme';
import { useBudgetStatus } from '@/hooks/use-budgets';
import { useMonthSummary, useRecentTransactions } from '@/hooks/use-transactions';
import { useTheme } from '@/hooks/use-theme';

const today = new Date();

type HomeTransaction = TransactionListItemData & { date: Date };

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function stripTime(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDateGroupLabel(date: Date) {
  const diffDays = Math.round((stripTime(today).getTime() - stripTime(date).getTime()) / 86400000);
  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '昨天';
  return `${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAY_LABELS[date.getDay()]}`;
}

function groupByDate(transactions: HomeTransaction[]) {
  const groups = new Map<string, { date: Date; items: HomeTransaction[] }>();
  for (const transaction of transactions) {
    const key = stripTime(transaction.date).toISOString();
    if (!groups.has(key)) {
      groups.set(key, { date: transaction.date, items: [] });
    }
    groups.get(key)!.items.push(transaction);
  }
  return Array.from(groups.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
}

function formatTime(iso: string) {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// 首页：月度收支总览 + 预算进度 + 近7天账单（按天分组，每组一个日期标题 + 当天支出小计）
export default function HomeScreen() {
  const theme = useTheme();
  const { data: summary } = useMonthSummary();
  const { data: budgetStatus } = useBudgetStatus();
  const { data: recent } = useRecentTransactions(7);

  // 列表行显示全部交易（包括"不计入统计"的），汇总数字则由 getMonthSummary 过滤掉它们——
  // 账单是流水，统计是口径，两者故意不一致
  const items: HomeTransaction[] = (recent ?? []).map((t) => ({
    id: t.id,
    date: new Date(t.date),
    icon: t.categoryIcon ?? '📦',
    title: t.title,
    categoryLabel: t.categoryName ?? '未分类',
    time: formatTime(t.date),
    note: t.remarks ?? undefined,
    amount: t.amount,
    type: t.type,
  }));
  const dateGroups = groupByDate(items);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="title" style={styles.greeting}>
          首页
        </ThemedText>

        <MonthSummaryCard
          month={summary?.month ?? `${today.getMonth() + 1}月`}
          income={summary?.income ?? 0}
          expense={summary?.expense ?? 0}
          balance={summary?.balance ?? 0}
        />
        {/* 预算卡的"已消费"取各分类预算对应的花费之和，跟月度总支出不是同一个数：
            没设预算的分类不该算进预算消耗，否则永远显示超支 */}
        <BudgetProgressCard
          budgetTotal={budgetStatus?.budgetTotal ?? 0}
          spent={budgetStatus?.spent ?? 0}
          daysInMonth={new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()}
          daysElapsed={today.getDate()}
        />

        <ThemedText type="subtitle" style={styles.sectionTitle}>
          近7天账单
        </ThemedText>

        {dateGroups.length === 0 ? (
          <ThemedText type="default" themeColor="textSecondary">
            最近还没有账单，点底部的 + 记一笔吧。
          </ThemedText>
        ) : (
          <ThemedView type="backgroundElement" style={styles.listCard}>
            {dateGroups.map((group, groupIndex) => {
              const dailyExpense = group.items.filter((t) => t.type === 'EXPENSE').reduce((sum, t) => sum + t.amount, 0);
              const dailyIncome = group.items.filter((t) => t.type === 'INCOME').reduce((sum, t) => sum + t.amount, 0);
              const isLastGroup = groupIndex === dateGroups.length - 1;
              return (
                <View
                  key={group.date.toISOString()}
                  style={!isLastGroup && { borderBottomColor: theme.textSecondary, borderBottomWidth: StyleSheet.hairlineWidth }}>
                  <TransactionDateGroupHeader
                    label={formatDateGroupLabel(group.date)}
                    totalExpense={dailyExpense}
                    totalIncome={dailyIncome}
                  />
                  {group.items.map((item, itemIndex) => {
                    const isLast = itemIndex === group.items.length - 1;
                    return (
                      <View
                        key={item.id}
                        style={[styles.itemWrap, !isLast && { borderBottomColor: theme.textSecondary, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                        <TransactionListItem {...item} />
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </ThemedView>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.two,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  greeting: {
    fontSize: 28,
    lineHeight: 34,
    paddingHorizontal: Spacing.one,
  },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 24,
    paddingHorizontal: Spacing.one,
  },
  listCard: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  itemWrap: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
