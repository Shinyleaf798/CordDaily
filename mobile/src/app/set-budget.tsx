import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { DialogActions, ModalDialog } from '@/components/ui/modal-dialog';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useOverallBudget, useSetOverallBudget } from '@/hooks/use-budgets';
import { useTheme } from '@/hooks/use-theme';

// 本月预算：填一个总数就完事。口径是「本月全部支出 vs 这个数」，清空视为没设预算。
// 壳（遮罩、居中、键盘避让）交给 ModalDialog，这里只管这一屏问什么、存什么。
// 路由那边配的是 ScreenTransitions.dialog，headerShown 已经在预设里关掉了。
export default function SetBudgetScreen() {
  const theme = useTheme();
  const { data: overall } = useOverallBudget();
  const setOverallBudget = useSetOverallBudget();

  // 用 draft + 兜底，而不是 useEffect 里把查询结果 setState 进去：
  // 后者会多渲染一轮，还正好是 eslint 的 react-hooks/set-state-in-effect 要拦的写法
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? (overall != null ? String(overall) : '');
  const amount = parseAmount(value);

  const dismiss = () => router.back();

  // 金额非法时按钮是禁用的，走到这里 amount 一定 > 0。
  // 不把"输入空的"当成清除——清除有单独的按钮，误触保存不该把预算抹掉
  const save = () => {
    setOverallBudget.mutate(amount, { onSuccess: dismiss });
  };

  const clear = () => {
    setOverallBudget.mutate(0, { onSuccess: dismiss });
  };

  return (
    <ModalDialog title="本月预算" onDismiss={dismiss}>
      <ThemedText themeColor="textSecondary" style={styles.label}>
        这个月总共打算花多少
      </ThemedText>

      <View style={[styles.inputRow, { borderBottomColor: theme.cardHighlight }]}>
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

      <ThemedText themeColor="textSecondary" style={styles.hint}>
        首页会用「本月全部支出 ÷ 这个数」算进度，以及日均消费和剩余每日可消费。
      </ThemedText>

      {/* 写库失败以前是完全静默的：弹窗不关、也不说为什么，看起来就是"点了没反应" */}
      {setOverallBudget.isError ? (
        <ThemedText style={[styles.error, { color: theme.expense }]}>
          保存失败：{(setOverallBudget.error as Error).message}
        </ThemedText>
      ) : null}

      <DialogActions
        confirmLabel="保存"
        onCancel={dismiss}
        onConfirm={save}
        confirmDisabled={amount <= 0 || setOverallBudget.isPending}
      />

      {overall != null ? (
        <Pressable onPress={clear} hitSlop={8} style={styles.clearButton}>
          <ThemedText style={[styles.clearText, { color: theme.expense }]}>清除预算</ThemedText>
        </Pressable>
      ) : null}
    </ModalDialog>
  );
}

// 千分位逗号、空格、误打的货币符号都先剥掉再解析：
// App 里金额一律显示成 "1,842.50"，用户照着这个格式输入 "2,400" 是完全合理的，
// 而 Number("2,400") 是 NaN——之前这里会把 NaN 兜底成 0，等于静默清除预算
function parseAmount(raw: string): number {
  const amount = Number(raw.replace(/[^\d.]/g, ''));
  return Number.isFinite(amount) ? amount : 0;
}

const styles = StyleSheet.create({
  error: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    paddingBottom: Spacing.one,
    borderBottomWidth: 2,
    marginTop: Spacing.one,
  },
  currency: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '600',
  },
  input: {
    flex: 1,
    fontSize: 34,
    lineHeight: 42,
    fontWeight: '700',
    padding: 0,
  },
  hint: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
  clearButton: {
    alignItems: 'center',
    paddingVertical: Spacing.one,
  },
  clearText: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
  },
});
