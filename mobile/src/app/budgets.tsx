import { Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useBudgets, useBudgetStatus, useUpsertBudget } from '@/hooks/use-budgets';
import { useCategories } from '@/hooks/use-categories';
import { useTheme } from '@/hooks/use-theme';

// 预算按分类设，总预算是加总出来的衍生值（跟账户余额一样，不存会过期的缓存字段）。
// 这一页同时是"设置入口"和"本月执行情况"：改额度和看超支在同一个列表里，不用来回跳。
export default function BudgetsScreen() {
  const theme = useTheme();
  const { data: categories } = useCategories('EXPENSE');
  const { data: budgets } = useBudgets();
  const { data: status } = useBudgetStatus();
  const upsertBudget = useUpsertBudget();

  // 正在编辑的那一格用本地 state 暂存，失焦时才写库——
  // 每敲一个数字就写一次 SQLite 会让输入框跟着 React Query 的刷新一起抖
  const [draft, setDraft] = useState<{ categoryId: string; value: string } | null>(null);

  const budgetByCategory = new Map((budgets ?? []).map((b) => [b.categoryId, b.amount]));
  const statusByCategory = new Map((status?.items ?? []).map((item) => [item.categoryId, item]));

  const commitDraft = () => {
    if (!draft) return;
    const amount = Number(draft.value);
    // 输入非数字时按 0 处理，upsertBudget 里 <=0 会删掉这条预算
    upsertBudget.mutate({ categoryId: draft.categoryId, amount: Number.isFinite(amount) ? amount : 0 });
    setDraft(null);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: true, headerTitle: '预算' }} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedView type="backgroundElement" style={styles.totalCard}>
          <ThemedText type="small" themeColor="textSecondary">
            本月总预算（各分类加总）
          </ThemedText>
          <ThemedText type="subtitle">RM{(status?.budgetTotal ?? 0).toFixed(2)}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            已消费 RM{(status?.spent ?? 0).toFixed(2)}
          </ThemedText>
        </ThemedView>

        <ThemedText type="small" themeColor="textSecondary">
          留空或填 0 表示这个分类不设预算。计算时会跳过「不计入统计」的交易——垫付的钱不该算进预算消耗。
        </ThemedText>

        <ThemedView type="backgroundElement" style={styles.listCard}>
          {(categories ?? []).map((category, index) => {
            const item = statusByCategory.get(category.id);
            const stored = budgetByCategory.get(category.id);
            const isEditing = draft?.categoryId === category.id;

            return (
              <View
                key={category.id}
                style={[
                  styles.row,
                  index < (categories ?? []).length - 1 && {
                    borderBottomColor: theme.backgroundSelected,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                  },
                ]}>
                <ThemedText style={styles.icon}>{category.icon ?? '📦'}</ThemedText>

                <View style={styles.middle}>
                  <ThemedText type="default">{category.name}</ThemedText>
                  {item ? (
                    <ThemedText
                      type="small"
                      themeColor={item.isOverspent ? undefined : 'textSecondary'}
                      style={item.isOverspent ? { color: theme.expense } : undefined}>
                      已用 RM{item.spent.toFixed(2)} · {Math.round(item.percentage)}%
                      {item.isOverspent ? ` · 超支 RM${Math.abs(item.remaining).toFixed(2)}` : ''}
                    </ThemedText>
                  ) : (
                    <ThemedText type="small" themeColor="textSecondary">
                      未设预算
                    </ThemedText>
                  )}
                </View>

                <View style={[styles.inputWrap, { backgroundColor: theme.backgroundSelected }]}>
                  <ThemedText type="small" themeColor="textSecondary">
                    RM
                  </ThemedText>
                  <TextInput
                    value={isEditing ? draft.value : stored != null ? String(stored) : ''}
                    onChangeText={(value) => setDraft({ categoryId: category.id, value })}
                    onBlur={commitDraft}
                    onSubmitEditing={commitDraft}
                    keyboardType="numeric"
                    returnKeyType="done"
                    placeholder="0"
                    placeholderTextColor={theme.textSecondary}
                    style={[styles.input, { color: theme.text }]}
                  />
                </View>
              </View>
            );
          })}
        </ThemedView>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.two,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  totalCard: {
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  listCard: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
  },
  icon: {
    fontSize: 20,
  },
  middle: {
    flex: 1,
    gap: 2,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    height: 36,
    minWidth: 96,
    borderRadius: 10,
    paddingHorizontal: Spacing.two,
  },
  input: {
    flex: 1,
    fontSize: 14,
    textAlign: 'right',
  },
});
