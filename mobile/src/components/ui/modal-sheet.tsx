import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModalBackdrop } from '@/components/ui/modal-backdrop';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ModalSheetProps = {
  title?: string;
  onDismiss: () => void;
  dismissOnBackdropPress?: boolean;
  /** 弹层最多占屏幕高度的比例，默认 0.6（下半屏多一点）。内容不够高时会自动缩到内容的高度 */
  maxHeightRatio?: number;
  children: ReactNode;
};

/**
 * 从底部升起的弹层，只占屏幕下半部分，上面仍然看得见原来那一屏。
 *
 * 跟 presentation: 'modal' 的区别：那个是系统整页 modal，会把底下整屏盖掉；
 * 这个走 ScreenTransitions.sheet（transparentModal + slide_from_bottom），
 * 高度由这个组件自己控制，所以能停在半屏。
 *
 * 什么时候用它、什么时候用 ModalDialog：
 * - 底部弹层：要滚动、要列表、要多个字段（选分类、选账户、筛选条件）
 * - 对话框：只问一件事，一两个按钮就能答完
 *
 * 用拇指够得着的位置放内容，是它相对对话框唯一实打实的好处——所以别拿它装只有一行的东西。
 */
export function ModalSheet({
  title,
  onDismiss,
  dismissOnBackdropPress = true,
  maxHeightRatio = 0.6,
  children,
}: ModalSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <ModalBackdrop onPress={dismissOnBackdropPress ? onDismiss : undefined} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.bottom}
        pointerEvents="box-none">
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.backgroundElement,
              maxHeight: `${Math.round(maxHeightRatio * 100)}%`,
              // 底部安全区由弹层自己补，不靠外面包 SafeAreaView——
              // 包在外面的话弹层就贴不到屏幕最底下，底下会露出一条背景
              paddingBottom: insets.bottom + Spacing.four,
            },
          ]}>
          {/* 顶部那道短横条：告诉用户这东西是从下面上来的、可以被打发走。
              目前只是视觉提示，还没接手势拖拽 */}
          <View style={[styles.handle, { backgroundColor: theme.backgroundSelected }]} />

          {title ? <ThemedText style={styles.title}>{title}</ThemedText> : null}
          {children}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  bottom: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    // 只有上面两个角是圆的：下面两个角贴着屏幕边缘，倒圆角会露出背景
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    gap: Spacing.two,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.two,
  },
  title: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '700',
  },
});
