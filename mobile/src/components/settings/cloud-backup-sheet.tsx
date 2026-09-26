import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ModalHost } from '@/components/ui/modal-host';
import { ModalSheet, useSheetTransition } from '@/components/ui/modal-sheet';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { describeError } from '@/db/sync';
import { usePendingDeletions, usePushToCloud } from '@/hooks/use-backup';
import { useTheme } from '@/hooks/use-theme';

type CloudBackupSheetProps = {
  /** 待推送的**全部**记录数（账单 + 分类 + 账户 + 转账 + 周期规则），不只是账单 */
  unsynced: number;
  onDismiss: () => void;
};

/**
 * 点「备份到云端」之后的确认层。
 *
 * 这一层的存在只为一件事：**删除是不可逆的，得先说清楚再做**。
 * 新增的记录推错了顶多多一份，删错了就真没了——所以那些"会从云端删掉"的条目
 * 逐条列出来、带名字，而且给一个能取消的勾。
 *
 * 勾**默认是打开的**：备份的通常含义就是让云端跟本地一致。
 * 取消勾选不等于放弃那些删除——墓碑留着，下次备份会再问一次（见 db/deletions.ts）。
 *
 * 这里不再问"去云端还是导成文件"。两者被拆成了两个入口：这个按钮只管云端，
 * 导出成文件在「数据」组里单独一行——每次备份都先做一道选择题太烦，
 * 而那道题的答案几乎永远是云端。
 */
export function CloudBackupSheet({ unsynced, onDismiss }: CloudBackupSheetProps) {
  const theme = useTheme();
  const sheet = useSheetTransition(onDismiss, 0.75);
  const { data: deletions = [] } = usePendingDeletions();
  const [withDeletions, setWithDeletions] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pushToCloud = usePushToCloud();
  const nothingToDo = unsynced === 0 && deletions.length === 0;

  const handleConfirm = () => {
    setError(null);
    pushToCloud.mutate(
      { withDeletions },
      {
        onSuccess: () => sheet.close(),
        onError: (pushError) => setError(describeError(pushError)),
      },
    );
  };

  return (
    <ModalHost visible animation="none" onRequestClose={() => sheet.close()}>
      <ModalSheet title="备份到云端" transition={sheet}>
        <ScrollView contentContainerStyle={styles.body}>
          <View style={[styles.card, { backgroundColor: theme.background }]}>
            <View style={styles.line}>
              <ThemedText type="default">要上传的记录</ThemedText>
              <ThemedText type="default" themeColor="textSecondary">
                {unsynced} 条
              </ThemedText>
            </View>
            <View style={styles.line}>
              <ThemedText type="default">要从云端删掉的</ThemedText>
              <ThemedText type="default" themeColor={deletions.length ? 'expense' : 'textSecondary'}>
                {deletions.length} 条
              </ThemedText>
            </View>
          </View>

          {deletions.length ? (
            <>
              {/* 勾选行就是那个开关本身，整行可点——一个 16px 的方块太难点中 */}
              <Pressable
                onPress={() => setWithDeletions((current) => !current)}
                style={[styles.row, { backgroundColor: theme.background }]}>
                <View
                  style={[
                    styles.checkbox,
                    {
                      borderColor: withDeletions ? theme.cardHighlight : theme.backgroundSelected,
                      backgroundColor: withDeletions ? theme.cardHighlight : 'transparent',
                    },
                  ]}>
                  {withDeletions ? (
                    <Ionicons name="checkmark" size={14} color={theme.onCardHighlight} />
                  ) : null}
                </View>
                <View style={styles.rowText}>
                  <ThemedText type="default">同时在云端删除这 {deletions.length} 条</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    不勾也没关系，它们会留到下次备份再问你一次
                  </ThemedText>
                </View>
              </Pressable>

              <View style={[styles.card, { backgroundColor: theme.background }]}>
                {deletions.map((deletion) => (
                  <View key={`${deletion.kind}-${deletion.id}`} style={styles.line}>
                    <ThemedText type="small" numberOfLines={1} style={styles.grow}>
                      {deletion.label}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {KIND_LABELS[deletion.kind]}
                    </ThemedText>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {error ? (
            <ThemedText type="small" style={{ color: theme.expense }}>
              {error}
            </ThemedText>
          ) : null}

          <Pressable
            onPress={handleConfirm}
            disabled={pushToCloud.isPending || nothingToDo}
            style={[styles.primary, { backgroundColor: theme.cardHighlight }, nothingToDo && styles.dimmed]}>
            {pushToCloud.isPending ? (
              <ActivityIndicator color={theme.onCardHighlight} />
            ) : (
              <ThemedText type="default" style={{ color: theme.onCardHighlight }}>
                {nothingToDo ? '云端已经是最新的' : '开始备份'}
              </ThemedText>
            )}
          </Pressable>
        </ScrollView>
      </ModalSheet>
    </ModalHost>
  );
}

const KIND_LABELS = { transaction: '账单', category: '分类', account: '账户' } as const;

const styles = StyleSheet.create({
  body: { gap: Spacing.two, paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  grow: { flex: 1 },
  card: { borderRadius: 12, padding: Spacing.three, gap: Spacing.two },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.three, borderRadius: 12 },
  rowText: { flex: 1, gap: 2 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimmed: { opacity: 0.45 },
  primary: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.one,
  },
});
