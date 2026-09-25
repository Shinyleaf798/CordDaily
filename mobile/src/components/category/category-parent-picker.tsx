import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CategoryIcon } from '@/components/category/category-icon';
import { ModalHost } from '@/components/ui/modal-host';
import { ModalSheet, useSheetTransition } from '@/components/ui/modal-sheet';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import type { Category } from '@/db/categories';
import { useTheme } from '@/hooks/use-theme';

type CategoryParentPickerProps = {
  /** 正在被挪的那个分类 */
  category: Category;
  /** 可以挂上去的一级分类（同收支类型，已排除它自己） */
  parents: Category[];
  /** 移动失败时的说明。有值就把弹层留在原地，用户能看见原因 */
  error?: string | null;
  onPick: (parentId: string | null) => void;
  onDismiss: () => void;
};

/**
 * 「换一个上级分类」。
 *
 * 这一步存在的原因很实际：分类建的时候层级就定死了，建错了以前只能删掉重建——
 * 而一旦它已经被账单引用，连删都删不了，等于永远错下去。
 *
 * 第一项永远是「不放在任何分类下」，升级和降级走同一个列表：
 * 两件事在数据上是同一次写入（把 parentId 改成 null 或某个 id），
 * 分成两个入口只会让用户先想清楚自己要做的是"升"还是"降"。
 */
export function CategoryParentPicker({
  category,
  parents,
  error,
  onPick,
  onDismiss,
}: CategoryParentPickerProps) {
  const theme = useTheme();
  const transition = useSheetTransition(onDismiss, 0.7);
  const currentParentId = category.parentId ?? null;

  return (
    <ModalHost visible animation="none" onRequestClose={() => transition.close()}>
      <ModalSheet title={`把「${category.name}」挂到`} transition={transition}>
        {error ? (
          <ThemedText type="small" style={{ color: theme.expense }}>
            挪不过去：{error}
          </ThemedText>
        ) : null}

        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          <PickerRow
            label="不放在任何分类下"
            caption="它自己就是一个一级分类"
            selected={currentParentId === null}
            onPress={() => onPick(null)}
            leading={
              <View style={[styles.iconWrap, { backgroundColor: theme.background }]}>
                <Ionicons name="remove-outline" size={18} color={theme.textSecondary} />
              </View>
            }
          />

          {parents.map((parent) => (
            <PickerRow
              key={parent.id}
              label={parent.name}
              caption={parent.isActive ? undefined : '这个分类已停用'}
              selected={currentParentId === parent.id}
              onPress={() => onPick(parent.id)}
              leading={
                <View style={[styles.iconWrap, { backgroundColor: theme.background }]}>
                  <CategoryIcon icon={parent.icon} size={18} />
                </View>
              }
            />
          ))}
        </ScrollView>
      </ModalSheet>
    </ModalHost>
  );
}

type PickerRowProps = {
  label: string;
  caption?: string;
  selected: boolean;
  leading: React.ReactNode;
  onPress: () => void;
};

function PickerRow({ label, caption, selected, leading, onPress }: PickerRowProps) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={[styles.row, { backgroundColor: selected ? theme.backgroundSelected : 'transparent' }]}>
      {leading}
      <View style={styles.rowText}>
        <ThemedText style={{ fontSize: 16 }}>{label}</ThemedText>
        {caption ? (
          <ThemedText type="small" themeColor="textSecondary">
            {caption}
          </ThemedText>
        ) : null}
      </View>
      {/* 当前所在的那一项打勾而不是禁用：它是"现状"不是"错误选项"，
          点它等于什么都不改，db 层那句 early return 会直接收工 */}
      {selected ? <Ionicons name="checkmark" size={20} color={theme.cardHighlight} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: {
    // 弹层自己有 maxHeight，这里只要让内容超出时能滚
    flexGrow: 0,
  },
  listContent: {
    gap: Spacing.one,
    paddingBottom: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 52,
    borderRadius: 12,
    paddingHorizontal: Spacing.two,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 1,
  },
});
