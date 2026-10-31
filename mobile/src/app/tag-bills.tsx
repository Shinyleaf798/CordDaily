import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BatchEditSheet } from '@/components/search/batch-edit-sheet';
import { TransactionDetailSheet } from '@/components/transaction/transaction-detail-sheet';
import { TransactionMonthCard } from '@/components/transaction/transaction-month-card';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { Toast, useToast } from '@/components/ui/toast';
import { ScreenPadding, Spacing } from '@/constants/theme';
import { useTagTransactions } from '@/hooks/use-transactions';
import { useTheme } from '@/hooks/use-theme';
import { addDays, formatMonthDay, parseDayKey } from '@/utils/date';
import { formatCurrency } from '@/utils/format';
import { groupTransactionsByMonth } from '@/utils/transaction-view';

/**
 * 一个标签下的账单：`/tag-bills?tag=韩国旅行&from=2026-10-01&to=2026-11-01`。
 * 从账单预览的标签页签展开一个标签、点「查看这 N 笔账单」进来。from / to（to 不含）是那边选的那一段，
 * 「总」的时候不带，就是全部时间——这样点进来看到的跟那一行是同一批账。
 *
 * 按月分组，跟搜索结果同一个形状（TransactionMonthCard）：一个标签可以横跨好几个月甚至几年
 * （"订阅"这种长期标签），按天分会变成一堆各含一行的卡。
 *
 * 顶上的合计**不跳过 excludeFromStats**，跟搜索结果一个口径：这里回答的是"这批账一共多少钱"。
 * 标签汇总页那个数只算支出，所以两边的支出合计在有"不计入统计"的账时会对不上——那是口径不同，不是 bug
 *
 * **批量修改**跟搜索结果一模一样：汇总那一排最左边一个全选方格，点了全勾上并进勾选模式，
 * 全选时再点一下全部取消并退出；底栏「已选 N 笔 / 修改」，弹的是同一个 BatchEditSheet。
 * 一个标签圈出来的本来就是"一批要一起处理的账"（比如一趟旅行全部改记到信用卡上），所以这里也要有
 */
export default function TagBillsScreen() {
  const theme = useTheme();
  const { tag, from, to } = useLocalSearchParams<{ tag?: string; from?: string; to?: string }>();
  const { data: allRows } = useTagTransactions(tag);
  const start = parseDayKey(from);
  const end = parseDayKey(to);
  const [detailId, setDetailId] = useState<string | null>(null);
  /** 勾选模式。null = 没在勾，Set = 正在勾、勾了这些（理由同 search-overlay 里同名的 state） */
  const [selectedIds, setSelectedIds] = useState<Set<string> | null>(null);
  const [isBatchEditing, setIsBatchEditing] = useState(false);
  const toast = useToast();

  // 时间段在这里筛，不进 SQL：一个标签的账本来就不多，查询保持一个，换时间段不用多一种缓存 key
  const list = (allRows ?? []).filter((t) => {
    const time = new Date(t.date).getTime();
    return (!start || time >= start.getTime()) && (!end || time < end.getTime());
  });
  // 末日是"不含"的那天，显示时退一天：10月1日 - 11月1日 读起来像包含 11月1日
  const rangeLabel =
    start && end ? `${formatMonthDay(start)} - ${formatMonthDay(addDays(end, -1))}` : '全部时间';
  const expense = list.filter((t) => t.type === 'EXPENSE').reduce((sum, t) => sum + t.amountInBase, 0);
  const income = list.filter((t) => t.type === 'INCOME').reduce((sum, t) => sum + t.amountInBase, 0);
  const groups = groupTransactionsByMonth(list);

  // 只算还在列表里的那几笔：改完之后列表会重查，拿着已经不在眼前的 id 去改，等于改了看不见的账
  const selectedRows = selectedIds ? list.filter((t) => selectedIds.has(t.id)) : [];
  const isAllSelected = list.length > 0 && selectedRows.length === list.length;

  const toggleSelectAll = () => setSelectedIds(isAllSelected ? null : new Set(list.map((t) => t.id)));
  const toggleSelected = (id: string) =>
    setSelectedIds((prev) => {
      if (!prev) return prev;
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: true, headerTitle: tag || '标签' }} />

      <ScrollView contentContainerStyle={styles.content}>
        <ThemedView type="backgroundElement" style={styles.summary}>
          <Pressable
            onPress={toggleSelectAll}
            disabled={list.length === 0}
            hitSlop={10}
            accessibilityRole="checkbox"
            accessibilityLabel="全选"
            accessibilityState={{ checked: isAllSelected }}
            style={styles.summaryCount}>
            <Ionicons
              name={isAllSelected ? 'checkbox' : 'square-outline'}
              size={20}
              color={isAllSelected ? theme.cardHighlight : theme.textSecondary}
            />
            <ThemedText type="small" themeColor="textSecondary">
              {rangeLabel} · {list.length} 笔
            </ThemedText>
          </Pressable>
          <View style={styles.totals}>
            <ThemedText style={styles.total}>支出 {formatCurrency(expense)}</ThemedText>
            {income > 0 ? <ThemedText style={styles.total}>收入 {formatCurrency(income)}</ThemedText> : null}
          </View>
        </ThemedView>

        {groups.map((group) => (
          <View key={group.key}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.monthHeading}>
              {group.label}
            </ThemedText>
            <TransactionMonthCard
              group={group}
              onSelect={selectedIds ? toggleSelected : setDetailId}
              selectedIds={selectedIds ?? undefined}
            />
          </View>
        ))}
      </ScrollView>

      {/* 勾选模式的底栏，钉在页面底部，滚到哪都够得着 */}
      {selectedIds ? (
        <View style={[styles.selectBar, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.selectCount}>
            已选 {selectedRows.length} 笔
          </ThemedText>
          <Pressable
            onPress={() => setIsBatchEditing(true)}
            disabled={selectedRows.length === 0}
            style={[
              styles.selectAction,
              { backgroundColor: theme.cardHighlight, opacity: selectedRows.length > 0 ? 1 : 0.4 },
            ]}>
            <ThemedText type="small" style={[styles.selectActionText, { color: theme.onCardHighlight }]}>
              修改
            </ThemedText>
          </Pressable>
        </View>
      ) : null}

      {detailId ? <TransactionDetailSheet transactionId={detailId} onDismiss={() => setDetailId(null)} /> : null}

      {isBatchEditing ? (
        <BatchEditSheet
          transactions={selectedRows}
          onDismiss={() => setIsBatchEditing(false)}
          onDone={(count) => {
            setSelectedIds(null);
            toast.show(`已修改 ${count} 笔`);
          }}
        />
      ) : null}

      <Toast toast={toast.toast} onHide={toast.clear} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: ScreenPadding,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.six,
    gap: 10,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  summaryCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  totals: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 12,
    flexShrink: 1,
  },
  total: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  monthHeading: {
    marginBottom: 6,
    marginLeft: 4,
    fontWeight: '600',
  },
  selectBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: ScreenPadding,
    paddingVertical: 10,
  },
  selectCount: {
    flex: 1,
  },
  selectAction: {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  selectActionText: {
    fontWeight: '700',
  },
});
