import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryEditorDialog } from '@/components/category/category-editor-dialog';
import { CategoryIcon } from '@/components/category/category-icon';
import { TransactionTypeTabs } from '@/components/transaction/transaction-type-tabs';
import { DialogActions, ModalDialog } from '@/components/ui/modal-dialog';
import { ModalHost } from '@/components/ui/modal-host';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { Spacing } from '@/constants/theme';
import type { Category, CategoryType } from '@/db/categories';
import { useCategories, useCategoryUsage, useDeleteCategory } from '@/hooks/use-categories';
import { useTheme } from '@/hooks/use-theme';

/**
 * 分类管理。入口有两个：记账页分类网格最后那个「设置」格子，和「我的 → 分类管理」。
 * 从记账页进来时带 `?type=INCOME`，省得用户刚在记账页选了收入、进来还要再切一次。
 *
 * 编辑和删除做成两个显式按钮，没用左滑删除：左滑是"藏起来的功能"，
 * 而删分类是有前提条件的（被引用就删不掉），前提藏在手势后面，用户只会觉得滑了没反应。
 */
export default function CategoriesScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ type?: string }>();
  const [type, setType] = useState<CategoryType>(params.type === 'INCOME' ? 'INCOME' : 'EXPENSE');

  const { data: categories } = useCategories(type);
  const rows = categories ?? [];
  const { data: usage } = useCategoryUsage(rows.map((c) => c.id));

  // 一级在外、二级挂在各自父下面。分层只在这一页做，记账页的网格自己也分一次——
  // 两边要的形状不一样（这里是嵌套列表，那边是网格 + 浮层），共用一个结构反而都别扭
  const parents = rows.filter((c) => !c.parentId);
  const childrenOf = new Map<string, Category[]>();
  for (const row of rows) {
    if (!row.parentId) continue;
    childrenOf.set(row.parentId, [...(childrenOf.get(row.parentId) ?? []), row]);
  }
  const deleteCategory = useDeleteCategory();

  // null = 没开；{ category: null } = 新建；{ category } = 编辑那一条。
  // 用一个 state 表示三态，而不是 isOpen + editingCategory 两个——两个 state 就可能出现
  // "开着但没数据"这种本不该存在的组合
  const [editor, setEditor] = useState<{ category: Category | null; parent?: Category } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Category | null>(null);

  // 只在成功时关对话框。失败了留在原地把 db 层抛的话显示出来——
  // 静默关掉的话用户看到分类还在，只会以为是自己没点中
  const confirmDelete = () => {
    if (!pendingDelete) return;
    deleteCategory.mutate(pendingDelete.id, { onSuccess: () => setPendingDelete(null) });
  };

  const dismissDelete = () => {
    deleteCategory.reset();
    setPendingDelete(null);
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['bottom', 'left', 'right']}>
      <ThemedView style={styles.container}>
        <View style={styles.tabsRow}>
          <TransactionTypeTabs value={type} onChange={setType} />
        </View>

        <ScrollView contentContainerStyle={styles.list}>
          {parents.map((parent) => {
            const children = childrenOf.get(parent.id) ?? [];
            return (
              <View key={parent.id} style={styles.group}>
                <CategoryRow
                  category={parent}
                  used={usage?.[parent.id] ?? 0}
                  childCount={children.length}
                  onEdit={() => setEditor({ category: parent })}
                  onDelete={() => setPendingDelete(parent)}
                  onAddChild={() => setEditor({ category: null, parent })}
                />
                {children.map((child) => (
                  <CategoryRow
                    key={child.id}
                    category={child}
                    used={usage?.[child.id] ?? 0}
                    childCount={0}
                    indented
                    onEdit={() => setEditor({ category: child })}
                    onDelete={() => setPendingDelete(child)}
                  />
                ))}
              </View>
            );
          })}

          <Pressable
            onPress={() => setEditor({ category: null })}
            style={[styles.addRow, { borderColor: theme.cardHighlight }]}>
            <Ionicons name="add" size={20} color={theme.cardHighlight} />
            <ThemedText type="default" style={{ color: theme.cardHighlight }}>
              新建{type === 'EXPENSE' ? '支出' : '收入'}分类
            </ThemedText>
          </Pressable>
        </ScrollView>
      </ThemedView>

      {/* 只在打开时挂载：对话框的初始值就能直接从 props 读，不用 useEffect 往 state 里同步 */}
      {editor ? (
        <CategoryEditorDialog
          type={type}
          category={editor.category}
          // 只跟同一层比重名：「餐饮 > 早餐」和「交通 > 早餐」互不冲突
          siblingNames={rows
            .filter((c) => (c.parentId ?? null) === (editor.parent?.id ?? editor.category?.parentId ?? null))
            .map((c) => c.name)}
          parentId={editor.parent?.id}
          parentName={editor.parent?.name}
          onDismiss={() => setEditor(null)}
        />
      ) : null}

      {pendingDelete ? (
        <ModalHost visible onRequestClose={dismissDelete}>
          <ModalDialog title="删除分类" onDismiss={dismissDelete}>
            <ThemedText themeColor="textSecondary">
              「{pendingDelete.name}」删掉之后不能恢复。没有记录在用它，所以不会影响任何账单。
            </ThemedText>
            {deleteCategory.error ? (
              <ThemedText type="small" style={{ color: theme.expense }}>
                删不掉：{deleteCategory.error.message}
              </ThemedText>
            ) : null}
            <DialogActions
              confirmLabel="删除"
              destructive
              onCancel={dismissDelete}
              onConfirm={confirmDelete}
              confirmDisabled={deleteCategory.isPending}
            />
          </ModalDialog>
        </ModalHost>
      ) : null}
    </SafeAreaView>
  );
}

type CategoryRowProps = {
  category: Category;
  used: number;
  childCount: number;
  indented?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  /** 只有一级分类有这个按钮——二级不能再往下分，两层足够描述一笔消费了 */
  onAddChild?: () => void;
};

// 一级和二级共用同一行，只差一个缩进和那个「+」。写成两份的话改样式要改两处
function CategoryRow({ category, used, childCount, indented, onEdit, onDelete, onAddChild }: CategoryRowProps) {
  const theme = useTheme();
  // 有子分类的也删不掉：外键指着它，级联删会顺手带走一堆没提示过的东西（见 db/categories.ts）
  const blocked = used > 0 || childCount > 0;

  return (
    <View
      style={[
        styles.row,
        indented && styles.indentedRow,
        { backgroundColor: indented ? theme.background : theme.backgroundElement },
      ]}>
      <View style={[styles.iconWrap, { backgroundColor: indented ? theme.backgroundElement : theme.background }]}>
        <CategoryIcon icon={category.icon} size={20} />
      </View>

      <View style={styles.rowText}>
        <ThemedText type="default">{category.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {childCount > 0 ? `${childCount} 个子分类` : used > 0 ? `${used} 笔记录在用` : '还没用过'}
        </ThemedText>
      </View>

      {onAddChild ? (
        <Pressable onPress={onAddChild} hitSlop={8} style={styles.rowAction}>
          <Ionicons name="add" size={20} color={theme.cardHighlight} />
        </Pressable>
      ) : null}

      <Pressable onPress={onEdit} hitSlop={8} style={styles.rowAction}>
        <Ionicons name="create-outline" size={20} color={theme.textSecondary} />
      </Pressable>

      {/* 删不掉的直接灰掉：让用户点了才知道不行，比一开始就说明白要糟 */}
      <Pressable
        onPress={onDelete}
        disabled={blocked}
        hitSlop={8}
        style={[styles.rowAction, blocked && styles.disabledAction]}>
        <Ionicons name="trash-outline" size={20} color={blocked ? theme.textSecondary : theme.expense} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabsRow: {
    paddingVertical: Spacing.three,
  },
  list: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.five,
    gap: Spacing.two,
  },
  // 一级和它的子分类贴在一起（间距比组与组之间小），一眼能看出谁挂在谁下面
  group: {
    gap: 2,
  },
  indentedRow: {
    marginLeft: Spacing.five,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowAction: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledAction: {
    opacity: 0.35,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginTop: Spacing.two,
  },
});
