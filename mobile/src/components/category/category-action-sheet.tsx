import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ModalHost } from '@/components/ui/modal-host';
import { ModalSheet, useSheetTransition } from '@/components/ui/modal-sheet';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import type { Category } from '@/db/categories';
import { useTheme } from '@/hooks/use-theme';

export type CategoryAction = 'edit' | 'move' | 'bills' | 'toggleActive' | 'delete';

type CategoryActionSheetProps = {
  category: Category;
  /** 它底下挂着几个子分类。一级分类才可能不是 0 */
  childCount: number;
  /** 有多少笔账单/周期规则在用它 */
  usage: number;
  onSelect: (action: CategoryAction) => void;
  onDismiss: () => void;
};

/**
 * 点一行右边的 `⋯` 弹出来的菜单。一个分类能做的事全在这里，行上不再挂第二个按钮。
 *
 * 行上原来是三个图标（加子分类 / 改 / 删），挤在一起还只放得下三件事。
 * 收进菜单之后每一项都写得出完整的句子，"为什么删不掉"也终于有地方说。
 *
 * **做不了的事是灰着列出来、并且写明原因**，不是藏起来：
 * 藏起来的话用户会反复找那个不存在的按钮，而"还有 125 笔记录在用它"这句话
 * 同时回答了"为什么不行"和"那我该干嘛"。
 */
export function CategoryActionSheet({
  category,
  childCount,
  usage,
  onSelect,
  onDismiss,
}: CategoryActionSheetProps) {
  const theme = useTheme();
  const transition = useSheetTransition(onDismiss, 0.62);

  // 选完先播完出场动画再执行，菜单不会在动作生效的同一帧里"啪"地消失
  const pick = (action: CategoryAction) => transition.close(() => onSelect(action));

  const isActive = !!category.isActive;
  const blockedByUsage = usage > 0;
  const blockedByChildren = childCount > 0;
  const deleteReason = blockedByUsage
    ? `${usage} 笔记录还在用它，删不掉——停用就够了`
    : blockedByChildren
      ? `底下还有 ${childCount} 个子分类，先把它们处理掉`
      : undefined;

  // 自己还带着子分类就不能挂到别人下面，否则就成了三层
  const moveReason = blockedByChildren ? '底下有子分类的，不能再挂到别人下面' : undefined;

  const subtitle = [
    childCount > 0 ? `${childCount} 个子分类` : null,
    usage > 0 ? `${usage} 笔记录` : '还没用过',
    isActive ? null : '已停用',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <ModalHost visible animation="none" onRequestClose={() => transition.close()}>
      <ModalSheet transition={transition}>
        <View style={styles.header}>
          <ThemedText style={styles.name}>{category.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {subtitle}
          </ThemedText>
        </View>

        <View style={[styles.group, { backgroundColor: theme.background }]}>
          <ActionRow icon="create-outline" label="改名字、换图标" onPress={() => pick('edit')} />
          <Divider />
          <ActionRow
            icon="git-branch-outline"
            label={category.parentId ? '挪到别的分类下面' : '挂到别的分类下面'}
            disabledReason={moveReason}
            onPress={() => pick('move')}
          />
          <Divider />
          <ActionRow icon="receipt-outline" label="查看这一类的账单" onPress={() => pick('bills')} />
        </View>

        <View style={[styles.group, { backgroundColor: theme.background }]}>
          {/* 停用是这一页最该被看见的那条路，所以用强调色，跟上面那组中性的操作分开 */}
          <ActionRow
            icon={isActive ? 'eye-off-outline' : 'eye-outline'}
            label={isActive ? '停用' : '重新启用'}
            caption={isActive ? '记账页不再显示它，已有账单照常统计' : '让它重新出现在记账页的分类里'}
            tint={theme.cardHighlight}
            onPress={() => pick('toggleActive')}
          />
          <Divider />
          <ActionRow
            icon="trash-outline"
            label="永久删除"
            caption={deleteReason}
            tint={theme.expense}
            disabledReason={deleteReason}
            onPress={() => pick('delete')}
          />
        </View>

        <Pressable
          onPress={() => transition.close()}
          style={[styles.cancel, { backgroundColor: theme.background }]}>
          <ThemedText style={{ color: theme.expense, fontSize: 16 }}>取消</ThemedText>
        </Pressable>
      </ModalSheet>
    </ModalHost>
  );
}

type ActionRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  caption?: string;
  tint?: string;
  /** 有值就是不能点，这句话会显示在标题下面当原因 */
  disabledReason?: string;
  onPress: () => void;
};

function ActionRow({ icon, label, caption, tint, disabledReason, onPress }: ActionRowProps) {
  const theme = useTheme();
  const disabled = !!disabledReason;
  const color = disabled ? theme.textSecondary : (tint ?? theme.text);

  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.row, disabled && styles.rowDisabled]}>
      <Ionicons name={icon} size={20} color={color} />
      <View style={styles.rowText}>
        <ThemedText style={{ color, fontSize: 16 }}>{label}</ThemedText>
        {caption ? (
          <ThemedText type="small" themeColor="textSecondary">
            {caption}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

function Divider() {
  const theme = useTheme();
  return <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />;
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    gap: 2,
    paddingBottom: Spacing.two,
  },
  name: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600',
  },
  group: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 52,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  rowDisabled: {
    opacity: 0.55,
  },
  rowText: {
    flex: 1,
    gap: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 52,
  },
  cancel: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.one,
  },
});
