import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { RestorePreview, RestoreResult } from '@/components/settings/restore-summary';
import { ModalHost } from '@/components/ui/modal-host';
import { ModalSheet, useSheetTransition } from '@/components/ui/modal-sheet';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { planImport, type BackupBundle, type ImportPlan, type ImportResult } from '@/db/backup';
import { describeError } from '@/db/sync';
import { useApplyImport } from '@/hooks/use-backup';
import { useTheme } from '@/hooks/use-theme';

type RestoreSheetProps = {
  /** 这份数据从哪来，显示在预览最上面那一行：「云端」或者文件名 */
  sourceLabel: string;
  /** 把 bundle 拿到手。云端是一个 GET，文件是 parseBundle(已经读进来的文本) */
  load: () => Promise<BackupBundle>;
  onDismiss: () => void;
};

/**
 * 恢复层：读一下 → 把将要发生的事逐条列出来 → 按一个确认 → 就地换成结果。
 *
 * **两个来源共用这一个弹层**，区别只有 `load` 怎么拿到 bundle——
 * 服务器那个接口特意按备份文件的形状返回，所以后面每一步都一样
 * （见 backend/src/services/sync.service.js）。
 *
 * 跟「备份到云端」是同一种交互：那两个按钮并排站在一张卡上，
 * 一个弹弹层、一个跳页面的话，点下去之前没人猜得到会发生哪种。
 *
 * **文件那条是先弹系统选择器、选完了才开这一层**（见「我的」页）。
 * 反过来的话，用户点一下会先看到一个空的恢复页、上面再压一层系统选择器——
 * 两层之后才回到正题。
 *
 * 一打开就开始读，不用再点一次"开始"——用户点「恢复」/ 选完文件时已经表达过这个意思了。
 */
export function RestoreSheet({ sourceLabel, load, onDismiss }: RestoreSheetProps) {
  const theme = useTheme();
  const sheet = useSheetTransition(onDismiss, 0.8);
  const applyImport = useApplyImport();

  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 打开即开始拉。ref 守一次，免得 StrictMode 或者重渲染时拉两遍
  const hasStarted = useRef(false);
  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    void (async () => {
      try {
        setPlan(await planImport(await load()));
      } catch (fetchError) {
        setError(describeError(fetchError));
      }
    })();
    // load 每次渲染都是新函数（调用方传的是内联箭头），放进依赖数组会反复触发；
    // 上面那个 ref 已经保证只跑一次，这里要的就是"挂载时读一次"
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConfirm = () => {
    if (!plan) return;
    setError(null);
    applyImport.mutate(
      { plan },
      {
        onSuccess: (applied) => setResult(applied),
        onError: (applyError) => setError((applyError as Error).message),
      },
    );
  };

  const isLoading = !plan && !result && !error;

  return (
    <ModalHost visible animation="none" onRequestClose={() => sheet.close()}>
      <ModalSheet title={result ? '恢复完成' : `从${sourceLabel}恢复`} transition={sheet}>
        <ScrollView contentContainerStyle={styles.body}>
          {isLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={theme.cardHighlight} />
              <ThemedText type="small" themeColor="textSecondary">
                正在读取{sourceLabel}…
              </ThemedText>
            </View>
          ) : null}

          {result ? <RestoreResult result={result} /> : null}
          {!result && plan ? <RestorePreview sourceLabel={sourceLabel} plan={plan} /> : null}

          {error ? (
            <ThemedText type="small" style={{ color: theme.expense }}>
              {error}
            </ThemedText>
          ) : null}

          {plan && !result ? (
            <Pressable
              onPress={handleConfirm}
              disabled={applyImport.isPending}
              style={[styles.primary, { backgroundColor: theme.cardHighlight }]}>
              {applyImport.isPending ? (
                <ActivityIndicator color={theme.onCardHighlight} />
              ) : (
                <ThemedText type="default" style={{ color: theme.onCardHighlight }}>
                  确认恢复 {plan.newTransactions} 笔
                </ThemedText>
              )}
            </Pressable>
          ) : null}

          {result ? (
            <Pressable
              onPress={() => sheet.close()}
              style={[styles.primary, { backgroundColor: theme.cardHighlight }]}>
              <ThemedText type="default" style={{ color: theme.onCardHighlight }}>
                完成
              </ThemedText>
            </Pressable>
          ) : null}
        </ScrollView>
      </ModalSheet>
    </ModalHost>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.three, paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  loading: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.five },
  primary: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
