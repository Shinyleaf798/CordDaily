import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { DialogActions, ModalDialog } from '@/components/ui/modal-dialog';
import { ModalHost } from '@/components/ui/modal-host';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useRenameTag } from '@/hooks/use-transactions';

type TagRenameDialogProps = {
  tag: string;
  /** 现有的全部标签名。新名字撞上其中一个时提示"会合并"，不拦——合并本来就是改名的正当用法 */
  existingTags: string[];
  onDismiss: () => void;
  onRenamed: (count: number, to: string) => void;
};

/**
 * 标签改名的对话框，从账单预览标签页签里展开一个标签、点「改名」打开。
 *
 * 改的是**全部时间**里用到这个标签的所有账，不只页签上选中的那一段——
 * 同一个标签在不同月份叫不同的名字，汇总就被拆散了，这正是改名要避免的事。说明里写明这一点
 */
export function TagRenameDialog({ tag, existingTags, onDismiss, onRenamed }: TagRenameDialogProps) {
  const theme = useTheme();
  const [name, setName] = useState(tag);
  const rename = useRenameTag();

  const trimmed = name.trim();
  const willMerge = trimmed !== tag && existingTags.includes(trimmed);
  const canSave = trimmed.length > 0 && trimmed !== tag && !rename.isPending;

  return (
    <ModalHost visible onRequestClose={onDismiss}>
      <ModalDialog title={`给「${tag}」改名`} onDismiss={onDismiss}>
        <TextInput
          value={name}
          onChangeText={setName}
          autoFocus
          selectTextOnFocus
          returnKeyType="done"
          placeholder="新的标签名"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
        />
        <ThemedText type="small" themeColor="textSecondary">
          {willMerge
            ? `「${trimmed}」已经有了，改完两个标签会合并成一个。`
            : '所有用到这个标签的账都会一起改，不只这一段时间的。'}
        </ThemedText>
        {rename.error ? (
          <ThemedText type="small" style={{ color: theme.expense }}>
            没改成：{rename.error.message}
          </ThemedText>
        ) : null}
        <DialogActions
          confirmLabel={willMerge ? '合并' : '改名'}
          onCancel={onDismiss}
          confirmDisabled={!canSave}
          onConfirm={() =>
            rename.mutate({ from: tag, to: trimmed }, { onSuccess: (count) => onRenamed(count, trimmed) })
          }
        />
      </ModalDialog>
    </ModalHost>
  );
}

const styles = StyleSheet.create({
  input: {
    height: 44,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
});
