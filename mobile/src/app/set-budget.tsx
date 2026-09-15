import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { Spacing } from '@/constants/theme';
import { useOverallBudget, useSetOverallBudget } from '@/hooks/use-budgets';
import { useTheme } from '@/hooks/use-theme';

// 本月预算：填一个总数就完事。口径是「本月全部支出 vs 这个数」，
// 清空则视为没设预算，首页的预算卡退回提示状态。
export default function SetBudgetScreen() {
  const theme = useTheme();
  const { data: overall } = useOverallBudget();
  const setOverallBudget = useSetOverallBudget();

  // 用 draft + 兜底，而不是 useEffect 里把查询结果 setState 进去：
  // 后者会多渲染一轮，还正好是 eslint 的 react-hooks/set-state-in-effect 要拦的写法
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? (overall != null ? String(overall) : '');

  const save = () => {
    const amount = Number(value);
    setOverallBudget.mutate(Number.isFinite(amount) ? amount : 0, {
      onSuccess: () => router.back(),
    });
  };

  const clear = () => {
    setOverallBudget.mutate(0, { onSuccess: () => router.back() });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />

      <ThemedView style={styles.container}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <ThemedText type="small" themeColor="textSecondary">
              取消
            </ThemedText>
          </Pressable>
          <ThemedText type="default" style={styles.headerTitle}>
            本月预算
          </ThemedText>
          <Pressable onPress={save} hitSlop={12} disabled={setOverallBudget.isPending}>
            <ThemedText type="smallBold" style={{ color: theme.cardHighlight }}>
              保存
            </ThemedText>
          </Pressable>
        </View>

        <View style={[styles.inputCard, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText themeColor="textSecondary" style={styles.inputLabel}>
            这个月总共打算花多少
          </ThemedText>
          <View style={styles.inputRow}>
            <ThemedText style={[styles.currency, { color: theme.cardHighlight }]}>RM</ThemedText>
            <TextInput
              value={value}
              onChangeText={setDraft}
              keyboardType="numeric"
              returnKeyType="done"
              onSubmitEditing={save}
              autoFocus
              placeholder="0"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text }]}
            />
          </View>
        </View>

        <ThemedText themeColor="textSecondary" style={styles.hint}>
          首页会用「本月全部支出 ÷ 这个数」算进度，以及日均消费和剩余每日可消费。
        </ThemedText>

        {overall != null ? (
          <Pressable onPress={clear} style={[styles.clearButton, { borderColor: theme.expense }]}>
            <ThemedText type="small" style={{ color: theme.expense }}>
              清除预算
            </ThemedText>
          </Pressable>
        ) : null}
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontWeight: '600',
  },
  inputCard: {
    borderRadius: 16,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  inputLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  currency: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '600',
  },
  input: {
    flex: 1,
    fontSize: 36,
    lineHeight: 44,
    fontWeight: '700',
    padding: 0,
  },
  hint: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
  },
  clearButton: {
    marginTop: 'auto',
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
