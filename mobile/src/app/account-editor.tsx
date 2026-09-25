import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { DialogActions, ModalDialog } from '@/components/ui/modal-dialog';
import { ModalHost } from '@/components/ui/modal-host';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { ScreenPadding, Spacing } from '@/constants/theme';
import {
  useAccounts,
  useAccountTransactionCount,
  useCreateAccount,
  useDefaultAccountId,
  useDeleteAccount,
  useUpdateAccount,
} from '@/hooks/use-accounts';
import { useTheme } from '@/hooks/use-theme';

/**
 * 新建 / 编辑账户（`/account-editor` 和 `/account-editor?id=xxx`）。
 *
 * 只有一个可填的字段：名称。币种是只读的一行。
 *
 * 账户在这个 App 里的职责只有一个——让一笔账能记下"我用什么付的"（现金、TNG、某张卡）。
 * 分类、图标、配色、卡号这些都没有：它们不影响任何一笔账的记录，
 * 只是让"新建一个账户"这件事看起来比实际更重。
 *
 * 「期初余额」也是这么去掉的：它唯一的用途是给账户余额一个起点，而余额已经不显示了
 * （见 components/account/account-row.tsx）。留着就是在问一个之后永远不会被读的数。
 * 库里那一列还在，保留原因写在 db/accounts.ts。
 */
export default function AccountEditorScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const { data: accounts } = useAccounts();
  const { data: defaultAccountId } = useDefaultAccountId();
  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();
  const deleteAccount = useDeleteAccount();

  const existing = id ? accounts?.find((a) => a.id === id) : undefined;
  const isEdit = !!id;

  // 初始值直接读进 useState，不用 useEffect 把 props 同步进 state（同 CategoryEditorDialog）
  const [name, setName] = useState(existing?.name ?? '');

  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const { data: affectedCount } = useAccountTransactionCount(isConfirmingDelete ? id : null);

  const trimmed = name.trim();
  const isDuplicate = (accounts ?? []).some((a) => a.id !== id && a.name === trimmed);
  const isPending = createAccount.isPending || updateAccount.isPending;
  const saveError = createAccount.error ?? updateAccount.error;
  const canSave = !!trimmed && !isDuplicate && !isPending;

  // 兜底账户（「不选择任何账户」）改得了名字，但删不掉
  const canDelete = isEdit && id !== defaultAccountId;

  const save = () => {
    if (!canSave) return;
    // openingBalance 不再由界面提供：新建时走 createAccount 的默认值 0，
    // 编辑时原样带回去，免得 updateAccount 把老账户上那个值默默重置掉
    const payload = { name: trimmed, openingBalance: existing?.openingBalance ?? 0 };

    if (isEdit && id) updateAccount.mutate({ ...payload, id }, { onSuccess: () => router.back() });
    else createAccount.mutate(payload, { onSuccess: () => router.back() });
  };

  return (
    <ThemedView style={styles.screen}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <ThemedView type="backgroundElement" style={styles.group}>
          <View style={styles.row}>
            <ThemedText style={styles.rowLabel}>名称</ThemedText>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="现金 / TNG / Maybank..."
              placeholderTextColor={theme.textSecondary}
              style={[styles.rowInput, { color: theme.text }]}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />

          {/* 币种不给选：全 App 记账都按 MYR 存（transactions.currency 固定 'MYR'、汇率固定 1）。
              这里放一个选择器的话，选了 USD 的账户余额会拿一堆 MYR 的流水算出来，
              数字是错的而界面上看不出来。等真做多币种（记账时存汇率）再打开 */}
          <View style={styles.row}>
            <ThemedText style={styles.rowLabel}>币种</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.rowValue}>
              马来西亚林吉特 (MYR)
            </ThemedText>
          </View>
        </ThemedView>

        <ThemedText type="small" themeColor="textSecondary">
          账户只是给账单标一下「用什么付的」，记账时在这几个名字里选一个。
        </ThemedText>

        {isDuplicate ? (
          <ThemedText type="small" style={{ color: theme.expense }}>
            已经有一个叫「{trimmed}」的账户了
          </ThemedText>
        ) : null}
        {saveError ? (
          <ThemedText type="small" style={{ color: theme.expense }}>
            保存失败：{saveError.message}
          </ThemedText>
        ) : null}

        <Pressable
          onPress={save}
          disabled={!canSave}
          style={[styles.submit, { backgroundColor: theme.cardHighlight, opacity: canSave ? 1 : 0.5 }]}>
          <ThemedText style={[styles.submitText, { color: theme.onCardHighlight }]}>
            {isEdit ? '保存' : '创建'}
          </ThemedText>
        </Pressable>

        {canDelete ? (
          <Pressable onPress={() => setIsConfirmingDelete(true)} style={styles.deleteButton}>
            <ThemedText type="small" style={{ color: theme.expense, fontWeight: '600' }}>
              删除这个账户
            </ThemedText>
          </Pressable>
        ) : null}
      </ScrollView>

      {isConfirmingDelete && id ? (
        <ModalHost visible onRequestClose={() => setIsConfirmingDelete(false)}>
          <ModalDialog
            title={`删除「${existing?.name ?? '这个账户'}」`}
            onDismiss={() => setIsConfirmingDelete(false)}>
            <ThemedText themeColor="textSecondary">
              {affectedCount
                ? `这个账户下的 ${affectedCount} 笔账单会转到「不选择任何账户」，账单本身不会丢。`
                : '这个账户下还没有账单。'}
              删掉之后不能恢复。
            </ThemedText>
            {deleteAccount.error ? (
              <ThemedText type="small" style={{ color: theme.expense }}>
                删不掉：{deleteAccount.error.message}
              </ThemedText>
            ) : null}
            <DialogActions
              confirmLabel="删除"
              destructive
              onCancel={() => setIsConfirmingDelete(false)}
              onConfirm={() => deleteAccount.mutate(id, { onSuccess: () => router.back() })}
              confirmDisabled={deleteAccount.isPending}
            />
          </ModalDialog>
        </ModalHost>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    paddingHorizontal: ScreenPadding,
    paddingTop: Spacing.three,
    gap: 12,
    paddingBottom: Spacing.six,
  },
  group: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    minHeight: 52,
  },
  rowLabel: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
  },
  // 输入框和只读值都靠右，两种行看起来才是同一种行
  rowInput: {
    flex: 1,
    textAlign: 'right',
    fontSize: 15,
    padding: 0,
  },
  rowValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: 15,
    lineHeight: 21,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.three,
  },
  submit: {
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
  submitText: {
    fontSize: 16,
    fontWeight: '700',
  },
  deleteButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
});
