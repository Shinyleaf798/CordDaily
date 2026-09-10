import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BudgetProgressCard } from '@/components/home/budget-progress-card';
import { MonthSummaryCard } from '@/components/home/month-summary-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TransactionDateGroupHeader } from '@/components/transaction-date-group-header';
import { TransactionListItem, type TransactionListItemData } from '@/components/transaction-list-item';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/store/auth.store';

// TODO(dummy data): 接 db/transactions.ts + db/budgets.ts 之后，把下面这几个常量换成真实 hooks（useMonthSummary / useBudgetStatus / useRecentTransactions）
const today = new Date();
const yesterday = new Date(today);
yesterday.setDate(today.getDate() - 1);
const dayBeforeYesterday = new Date(today);
dayBeforeYesterday.setDate(today.getDate() - 2);

const MONTH_SUMMARY = { month: `${today.getMonth() + 1}月`, expense: 56.1, income: 0, balance: -56.1 };
const BUDGET_STATUS = {
  budgetTotal: 800,
  spent: 56.1,
  daysInMonth: new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate(),
  daysElapsed: today.getDate(),
};

type MockTransaction = TransactionListItemData & { date: Date };

const RECENT_TRANSACTIONS: MockTransaction[] = [
  { id: '1', date: today, icon: '🚌', title: '车费', categoryLabel: '交通', time: '08:02', amount: 3.6, type: 'EXPENSE' },
  { id: '2', date: today, icon: '🛒', title: '日用品', categoryLabel: '购物', time: '19:20', note: '洗发水', amount: 23, type: 'EXPENSE' },
  { id: '3', date: yesterday, icon: '🍚', title: '午餐', categoryLabel: '餐饮', time: '13:16', note: 'tjmart 菜饭', amount: 18, type: 'EXPENSE' },
  { id: '4', date: dayBeforeYesterday, icon: '🍔', title: '午餐', categoryLabel: '餐饮', time: '13:40', note: 'McDonald', amount: 11.5, type: 'EXPENSE' },
];

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

function groupByDate(transactions: MockTransaction[]) {
  const groups = new Map<string, { date: Date; items: MockTransaction[] }>();
  for (const transaction of transactions) {
    const key = stripTime(transaction.date).toISOString();
    if (!groups.has(key)) {
      groups.set(key, { date: transaction.date, items: [] });
    }
    groups.get(key)!.items.push(transaction);
  }
  return Array.from(groups.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
}

// 首页：月度收支总览 + 预算进度 + 近7天账单（按天分组，每组一个日期标题 + 当天支出小计）
export default function HomeScreen() {
  const theme = useTheme();
  const user = useAuthStore((s) => s.user);
  const dateGroups = groupByDate(RECENT_TRANSACTIONS);

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="title" style={styles.greeting}>
          Hi{user?.name ? `, ${user.name}` : ''}
        </ThemedText>

        <MonthSummaryCard {...MONTH_SUMMARY} />
        <BudgetProgressCard {...BUDGET_STATUS} />

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
              return (
                <View key={group.date.toISOString()}>
                  <TransactionDateGroupHeader label={formatDateGroupLabel(group.date)} totalExpense={dailyExpense} />
                  {group.items.map((item, itemIndex) => {
                    const isLast = groupIndex === dateGroups.length - 1 && itemIndex === group.items.length - 1;
                    return (
                      <View
                        key={item.id}
                        style={[styles.itemWrap, !isLast && { borderBottomColor: theme.backgroundSelected, borderBottomWidth: StyleSheet.hairlineWidth }]}>
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
    borderRadius: 16,
    overflow: 'hidden',
    paddingVertical: Spacing.one,
  },
  itemWrap: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
