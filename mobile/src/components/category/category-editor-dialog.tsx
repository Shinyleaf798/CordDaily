import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { CategoryIconPicker } from '@/components/category/category-icon-picker';
import { DialogActions, ModalDialog } from '@/components/ui/modal-dialog';
import { ModalHost } from '@/components/ui/modal-host';
import { ThemedText } from '@/components/ui/themed-text';
import { builtinIconRef } from '@/constants/category-icons';
import { Spacing } from '@/constants/theme';
import type { Category, CategoryType } from '@/db/categories';
import { useCreateCategory, useUpdateCategory } from '@/hooks/use-categories';
import { useTheme } from '@/hooks/use-theme';

type CategoryEditorDialogProps = {
  /** 新建时传类型；编辑时这个值应当跟 category.type 一致 */
  type: CategoryType;
  /** 传了就是编辑，不传是新建 */
  category?: Category | null;
  /** 同类型下已有的分类名，用来挡重名（编辑时会把自己排除掉） */
  siblingNames: string[];
  onDismiss: () => void;
};

/**
 * 新建 / 编辑分类。两件事共用一个对话框：字段完全一样，拆成两个只会有两份要同步维护的表单。
 *
 * 调用方**只在打开时挂载它**（`{editing && <CategoryEditorDialog .../>}`），
 * 所以初始值可以直接从 props 读进 useState——不需要 useEffect 把 props 同步进 state，
 * 那个写法会多渲染一轮，也正是 eslint 的 react-hooks/set-state-in-effect 要拦的。
 */
export function CategoryEditorDialog({ type, category, siblingNames, onDismiss }: CategoryEditorDialogProps) {
  const theme = useTheme();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();

  const [name, setName] = useState(category?.name ?? '');
  const [icon, setIcon] = useState(category?.icon ?? builtinIconRef('other'));

  const trimmed = name.trim();
  const isDuplicate = siblingNames.some((n) => n !== category?.name && n === trimmed);
  const isPending = createCategory.isPending || updateCategory.isPending;
  // 写库失败（磁盘满、约束冲突）要说出来。onSuccess 里才关对话框，
  // 失败时表单原样留着，用户填的字不会白填
  const saveError = createCategory.error ?? updateCategory.error;
  const canSave = !!trimmed && !isDuplicate && !isPending;

  const save = () => {
    if (!canSave) return;
    if (category) {
      updateCategory.mutate({ id: category.id, name: trimmed, icon }, { onSuccess: onDismiss });
    } else {
      createCategory.mutate({ name: trimmed, type, icon }, { onSuccess: onDismiss });
    }
  };

  return (
    <ModalHost visible onRequestClose={onDismiss}>
      <ModalDialog title={category ? '编辑分类' : `新建${type === 'EXPENSE' ? '支出' : '收入'}分类`} onDismiss={onDismiss}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="分类名称"
          placeholderTextColor={theme.textSecondary}
          autoFocus={!category}
          maxLength={12}
          style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
        />

        {/* 重名不是硬错误（库里没有唯一约束），但两个同名分类在网格里根本分不出来，所以拦在这一层 */}
        {isDuplicate ? (
          <ThemedText type="small" style={{ color: theme.expense }}>
            已经有一个叫「{trimmed}」的分类了
          </ThemedText>
        ) : null}

        {saveError ? (
          <ThemedText type="small" style={{ color: theme.expense }}>
            没能保存：{saveError.message}
          </ThemedText>
        ) : null}

        <View style={styles.pickerWrap}>
          <CategoryIconPicker value={icon} onChange={setIcon} />
        </View>

        <DialogActions confirmLabel="保存" onCancel={onDismiss} onConfirm={save} confirmDisabled={!canSave} />
      </ModalDialog>
    </ModalHost>
  );
}

const styles = StyleSheet.create({
  input: {
    height: 44,
    borderRadius: 12,
    paddingHorizontal: Spacing.two,
    fontSize: 16,
  },
  pickerWrap: {
    marginTop: Spacing.one,
  },
});
