import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { CategoryIcon } from '@/components/category/category-icon';
import { CategoryIconPicker } from '@/components/category/category-icon-picker';
import { ModalHost } from '@/components/ui/modal-host';
import { ModalSheet, useSheetTransition } from '@/components/ui/modal-sheet';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import type { Category, CategoryType } from '@/db/categories';
import { useCreateCategory, useUpdateCategory } from '@/hooks/use-categories';
import { useTheme } from '@/hooks/use-theme';

/** 左边那个方块的边长。要同时装下图标和「点击选择」那行小字，比选择器里的图标格（42）大一圈 */
const ICON_SLOT = 76;

type CategoryEditorSheetProps = {
  /** 新建时传类型；编辑时这个值应当跟 category.type 一致 */
  type: CategoryType;
  /** 传了就是编辑，不传是新建 */
  category?: Category | null;
  /** 同一层里已有的分类名，用来挡重名（编辑时会把自己排除掉）。同层才算重名：
   *  「餐饮 > 早餐」和「交通 > 早餐」不冲突，各自的父不同 */
  siblingNames: string[];
  /** 传了就是在这个一级分类下面新建子分类 */
  parentId?: string | null;
  /** 父分类名，只用于标题 */
  parentName?: string;
  onDismiss: () => void;
};

/**
 * 新建 / 编辑分类。两件事共用一张弹层：字段完全一样，拆成两个只会有两份要同步维护的表单。
 *
 * **从居中对话框改成了底部弹层。** 按 modal-dialog 自己写的那条分界线，
 * 「只问一件事、一两个按钮答完」才用对话框，而这张表单有名字、有图标、图标还要展开一大片
 * 可滚动的选择器——它一直站在弹层那一边，只是最初按对话框写的。
 * 改过来顺带把键盘那件事也解决了：弹层本来就贴着键盘顶边（ModalSheet 的 paddingBottom），
 * 不需要对话框那套"量一下被盖住多少再抬多少"。
 *
 * **图标默认是空的，不预设一个。**
 * 原来新建时直接塞 `builtin:other`，于是每个用户建的分类都先长成同一个纸箱，
 * 而那个纸箱看起来像"已经选好了"，多数人就不会再去动它。现在那一格是问号加「点击选择」——
 * 它在问，而不是替用户答。真的没选就保存也行，列表里由 CategoryIcon 的兜底 emoji 顶上（📦），
 * 看起来跟从前一样，区别是这回那个结果是用户默许的。
 *
 * **选择器在同一张弹层里展开，不另开一层。**
 * 叠第二个 Modal 意味着两个原生窗口，而这个项目在 Modal 窗口的 IME 控制权交接上
 * 还留着一个没解决的毛病（见 DECISIONS.md）。展开只是同一棵树里多一段内容，
 * 没有新窗口，返回键该关谁也不用重新安排。
 *
 * 调用方**只在打开时挂载它**（`{editor && <CategoryEditorSheet .../>}`），
 * 所以初始值可以直接从 props 读进 useState——不需要 useEffect 把 props 同步进 state。
 */
export function CategoryEditorSheet({
  type,
  category,
  siblingNames,
  parentId,
  parentName,
  onDismiss,
}: CategoryEditorSheetProps) {
  const theme = useTheme();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  // 展开选择器之后内容高得多，所以上限一次给够。弹层高度本来就是内容撑出来的，
  // 收起时它自然矮回去——不用跟着状态改这个比例
  const transition = useSheetTransition(onDismiss, 0.86);

  const [name, setName] = useState(category?.name ?? '');
  // null = 还没选。编辑已有分类时读它原来的值（老数据一定有图标）
  const [icon, setIcon] = useState<string | null>(category?.icon ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const trimmed = name.trim();
  const isDuplicate = siblingNames.some((n) => n !== category?.name && n === trimmed);
  const isPending = createCategory.isPending || updateCategory.isPending;
  // 写库失败（磁盘满、约束冲突）要说出来。成功了才关弹层，
  // 失败时表单原样留着，用户填的字不会白填
  const saveError = createCategory.error ?? updateCategory.error;
  const canSave = !!trimmed && !isDuplicate && !isPending;

  const title = category
    ? '编辑分类'
    : parentName
      ? `在「${parentName}」下新建子分类`
      : `新建${type === 'EXPENSE' ? '支出' : '收入'}分类`;

  const togglePicker = () => {
    // 收键盘再展开：选图标是一件纯点击的事，而键盘占着半屏，
    // 不收的话展开出来的选择器只剩一条缝
    if (!pickerOpen) Keyboard.dismiss();
    setPickerOpen((open) => !open);
  };

  // 选完就收起，方块当场变成选中的那个图标——让"我选的是这个"有个落点。
  // 上传图片走的也是这个口（CategoryIconPicker 传图成功后同样调 onChange）
  const pickIcon = (next: string) => {
    setIcon(next);
    setPickerOpen(false);
  };

  const save = () => {
    if (!canSave) return;
    // 先播完出场动画再让调用方卸载，不在保存成功的同一帧里"啪"地消失
    const done = () => transition.close();
    if (category) {
      updateCategory.mutate({ id: category.id, name: trimmed, icon }, { onSuccess: done });
    } else {
      createCategory.mutate({ name: trimmed, type, icon, parentId }, { onSuccess: done });
    }
  };

  return (
    <ModalHost visible animation="none" onRequestClose={() => transition.close()}>
      <ModalSheet transition={transition}>
        {/* 标题自己画，不走 ModalSheet 的 title：那个是左对齐的（六张弹层都靠它），
            而这张表单的标题要居中压在卡片正上方。跟 category-action-sheet 同一个做法 */}
        <ThemedText style={styles.title}>{title}</ThemedText>

        <View style={[styles.card, { backgroundColor: theme.background }]}>
          {/* 外面这层只负责接触摸，边框画在里面那个 View 上：
              Pressable 自己带 borderStyle: 'dashed' 时，Android 的按下反馈会沿着虚线裁出一圈毛边 */}
          <Pressable onPress={togglePicker} style={styles.iconSlotWrap}>
            <View
              style={[
                styles.iconSlot,
                {
                  borderColor: icon ? theme.cardHighlight : theme.textSecondary + '55',
                  // 还没选时用虚线：实线看着像"这里已经有东西了"
                  borderStyle: icon ? 'solid' : 'dashed',
                  backgroundColor: icon ? theme.cardHighlight + '22' : 'transparent',
                },
              ]}>
              {icon ? (
                <CategoryIcon icon={icon} size={30} />
              ) : (
                <Ionicons name="help" size={26} color={theme.textSecondary} />
              )}
              <ThemedText type="small" themeColor="textSecondary" style={styles.iconSlotLabel}>
                {pickerOpen ? '收起' : icon ? '点击更换' : '点击选择'}
              </ThemedText>
            </View>
          </Pressable>

          <View style={styles.fields}>
            <ThemedText style={styles.fieldLabel}>分类名称</ThemedText>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="建议 4 字内"
              placeholderTextColor={theme.textSecondary}
              autoFocus={!category}
              // 16 而不是 12：12 是按中文名定的（四个字绰绰有余），而「Crash of Clan」
              // 这种拉丁名 13 个字符就被截在半路。上限本身的作用是拦住那种没法显示的长名字，
              // 而 16 正好是两行网格标签装得下的量——再长，记账页那一格也只会显示成省略号
              maxLength={16}
              // 右对齐：标签在左、值在右。输入框自己不画底色也不画边框——
              // 它已经在卡片里了，再套一个框就是框里套框
              textAlign="right"
              style={[styles.input, { color: theme.text }]}
            />
          </View>
        </View>

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

        {pickerOpen ? (
          <View style={[styles.pickerWrap, { backgroundColor: theme.background }]}>
            {/* 选择器要的是字符串，还没选时给空串——空串谁也匹配不上，
                于是一格都不高亮，正好是"还没选"该有的样子 */}
            <CategoryIconPicker value={icon ?? ''} onChange={pickIcon} />
          </View>
        ) : null}

        <Pressable
          onPress={save}
          disabled={!canSave}
          style={[styles.confirm, { backgroundColor: theme.cardHighlight, opacity: canSave ? 1 : 0.5 }]}>
          <ThemedText style={[styles.confirmText, { color: theme.onCardHighlight }]}>确定</ThemedText>
        </Pressable>
      </ModalSheet>
    </ModalHost>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '700',
    textAlign: 'center',
    paddingBottom: Spacing.one,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: 14,
    padding: Spacing.three,
  },
  iconSlotWrap: {
    width: ICON_SLOT,
    height: ICON_SLOT,
  },
  iconSlot: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  iconSlotLabel: {
    fontSize: 11,
    lineHeight: 15,
  },
  fields: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  fieldLabel: {
    fontSize: 15,
  },
  input: {
    flex: 1,
    height: 44,
    fontSize: 16,
    // 安卓的 TextInput 自带一圈内距，不清掉的话右对齐的文字离卡片边缘差着好几点，
    // 跟上面那行标签对不齐
    padding: 0,
  },
  pickerWrap: {
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  confirm: {
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.one,
  },
  confirmText: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600',
  },
});
