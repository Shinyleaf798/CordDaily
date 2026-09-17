import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Dimensions, Easing, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModalBackdrop } from '@/components/ui/modal-backdrop';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type SheetTransition = {
  translateY: Animated.Value;
  backdropOpacity: Animated.Value;
  maxHeightRatio: number;
  /** 播完出场动画再执行 run（默认是 onDismiss）。重复调用只认第一次 */
  close: (run?: () => void) => void;
};

/** 底部弹层的进出场动画。做成 hook 是因为关闭发生在组件外面——点遮罩、按返回键、选中一个值，都得
 *  先播完动画再卸载，而已经卸载的东西没法做动画（跟原生栈那个空壳同源）。遮罩和卡片分两条、
 *  都走 useNativeDriver：卡片必须全程不透明，否则会透出底下那一屏。 */
export function useSheetTransition(onDismiss: () => void, maxHeightRatio = 0.6): SheetTransition {
  // 起始位移取最大可能高度而不是实测：实测要等 onLayout，会先闪一帧停在最终位置的弹层
  const [offscreen] = useState(() => Dimensions.get('window').height * maxHeightRatio);
  const [translateY] = useState(() => new Animated.Value(offscreen));
  const [backdropOpacity] = useState(() => new Animated.Value(0));
  const isClosing = useRef(false);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: 260,
        // 出场快、收尾慢，停下来有"贴住"的感觉；线性的会显得它是被拽上来的
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [translateY, backdropOpacity]);

  const close = useCallback(
    (run?: () => void) => {
      // 出场期间再点遮罩/再按返回键不该叠第二次动画，也不该把 onDismiss 跑两遍
      if (isClosing.current) return;
      isClosing.current = true;

      Animated.parallel([
        Animated.timing(translateY, {
          toValue: offscreen,
          duration: 220,
          // 进场是 out（减速停住），出场用 in（加速离开）——一头一尾都往"远离你"的方向走
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start(() => {
        (run ?? onDismiss)();
      });
    },
    [translateY, backdropOpacity, offscreen, onDismiss],
  );

  return { translateY, backdropOpacity, maxHeightRatio, close };
}

type ModalSheetProps = {
  title?: string;
  /** useSheetTransition 的返回值。高度比例和关闭动作都从这里读，不再单独传 */
  transition: SheetTransition;
  dismissOnBackdropPress?: boolean;
  children: ReactNode;
};

/**
 * 从底部升起的弹层，只占屏幕下半部分，上面仍然看得见原来那一屏。
 * 装在 ModalHost 里用，那一层必须配 animation="none"：进出场全由 useSheetTransition 驱动。
 *
 * 什么时候用它、什么时候用 ModalDialog：
 * - 底部弹层：要滚动、要列表、要多个字段（选分类、选账户、筛选条件）
 * - 对话框：只问一件事，一两个按钮就能答完
 *
 * 用拇指够得着的位置放内容，是它相对对话框唯一实打实的好处——所以别拿它装只有一行的东西。
 */
export function ModalSheet({ title, transition, dismissOnBackdropPress = true, children }: ModalSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { translateY, backdropOpacity, maxHeightRatio, close } = transition;

  return (
    <View style={styles.root}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: backdropOpacity }]}>
        <ModalBackdrop onPress={dismissOnBackdropPress ? () => close() : undefined} />
      </Animated.View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.bottom}
        pointerEvents="box-none">
        <Animated.View
          style={[
            styles.sheet,
            {
              transform: [{ translateY }],
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
        </Animated.View>
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
