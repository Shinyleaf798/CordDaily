import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ModalBackdrop } from '@/components/ui/modal-backdrop';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ModalDialogProps = {
  title?: string;
  /** 点遮罩或取消时调什么。路由型弹层一般传 () => router.back() */
  onDismiss: () => void;
  /** 点遮罩是否关闭。需要用户必须做出选择的场景传 false */
  dismissOnBackdropPress?: boolean;
  children: ReactNode;
};

/**
 * 居中的模态对话框：遮罩 + 一张浮在中间的卡片。
 *
 * 只负责"壳"——遮罩、居中、卡片底色、标题、键盘避让。里面放什么由调用方决定。
 * 窗口大小和位置是这个组件定的，不是 presentation 定的：路由那边只要配
 * ScreenTransitions.dialog（transparentModal + fade），给出一块透明全屏画布就够了。
 *
 * 什么时候用对话框、什么时候用底部弹层（modal-sheet）：
 * - 对话框：只问一件事、一两个按钮就能答完（确认删除、填一个数）
 * - 底部弹层：要滚动、要列表、要多个字段，够不着屏幕顶部也无所谓
 */
export function ModalDialog({ title, onDismiss, dismissOnBackdropPress = true, children }: ModalDialogProps) {
  const theme = useTheme();

  return (
    <View style={styles.root}>
      <ModalBackdrop onPress={dismissOnBackdropPress ? onDismiss : undefined} />

      {/* box-none：让点在卡片外、但在这层里的位置穿透到底下的遮罩上，否则点空白关不掉 */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.center}
        pointerEvents="box-none">
        <View style={[styles.dialog, { backgroundColor: theme.backgroundElement }]}>
          {title ? <ThemedText style={styles.title}>{title}</ThemedText> : null}
          {children}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

type DialogActionsProps = {
  cancelLabel?: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  confirmDisabled?: boolean;
  /** 确认按钮是不是危险操作（删除之类），是的话用支出色而不是强调色 */
  destructive?: boolean;
};

// 对话框底部的两个按钮。跟 ModalDialog 放同一个文件是因为它只服务于对话框，
// 拆成单独文件只会让"想做个对话框要 import 几个东西"变得更难回答。
export function DialogActions({
  cancelLabel = '取消',
  confirmLabel,
  onCancel,
  onConfirm,
  confirmDisabled,
  destructive,
}: DialogActionsProps) {
  const theme = useTheme();
  const confirmColor = destructive ? theme.expense : theme.cardHighlight;

  return (
    <View style={styles.actions}>
      <Pressable onPress={onCancel} style={[styles.button, { backgroundColor: theme.backgroundSelected }]}>
        <ThemedText style={styles.buttonText}>{cancelLabel}</ThemedText>
      </Pressable>
      <Pressable
        onPress={onConfirm}
        disabled={confirmDisabled}
        style={[styles.button, { backgroundColor: confirmColor, opacity: confirmDisabled ? 0.5 : 1 }]}>
        <ThemedText style={[styles.buttonText, { color: destructive ? theme.text : theme.onCardHighlight }]}>
          {confirmLabel}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  dialog: {
    width: '100%',
    // 上限而不是固定宽度：小屏上跟着屏幕缩，大屏上不会拉成一条横幅
    maxWidth: 340,
    borderRadius: 20,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  title: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  button: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
  },
});
