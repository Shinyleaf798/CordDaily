import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModalBackdrop } from '@/components/ui/modal-backdrop';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import { useTheme } from '@/hooks/use-theme';

export type SheetTransition = {
  translateY: Animated.Value;
  backdropOpacity: Animated.Value;
  maxHeightRatio: number;
  /**
   * 播完出场动画再执行 run（默认是 onDismiss）。重复调用只认第一次。
   *
   * **传了 run 就等于顶掉了默认的 onDismiss**，所以 run 里必须自己把弹层卸载掉
   * （`sheet.close(() => { onSelect(x); onDismiss(); })`，或者让调用方的 onSelect 顺手
   * 把那个 state 关掉——后者是全 App 现有的写法，见 transaction-form 里那几个 picker）。
   *
   * 漏了会**整屏卡死**，而且看不出是卡在哪：动画照常播完，遮罩淡到全透明，
   * 但组件还挂着 → RN 的 Modal 还是 visible → 一层看不见的全屏窗口吃掉所有触摸；
   * 与此同时 isClosing 已经置位，再点遮罩、再按返回键都会在第一行就 return。
   * 于是屏幕上什么都没变，却什么都点不动了。
   */
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
  /**
   * 钉在标题行右端的东西（图标按钮之类）。
   *
   * 做成插槽而不是让调用方自己在 children 顶上摆一行：标题是这一层画的，
   * 外面摆的那一行永远跟它对不齐——差的正好是这里 title 的行高和 sheet 的 gap。
   */
  headerRight?: ReactNode;
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
 *
 * **键盘避让用 padding，不用 KeyboardAvoidingView**，理由同 modal-dialog：
 * Android 分支原来走 behavior="height"，靠改容器高度让位，而改高度会让整棵子树
 * 重新布局、里面的 TextInput 跟着重新测量；这一层又套在 RN Modal 的独立窗口里，
 * 于是键盘弹出 → 缩高 → 重布局 → 焦点抖掉 → RN 发 hideSoftInput 的回路。
 * 换成 paddingBottom 只是把可用区的下边界抬上去，尺寸不变，回路不成立。
 */
export function ModalSheet({
  title,
  headerRight,
  transition,
  dismissOnBackdropPress = true,
  children,
}: ModalSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const { translateY, backdropOpacity, maxHeightRatio, close } = transition;

  return (
    <View style={styles.root}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: backdropOpacity }]}>
        <ModalBackdrop onPress={dismissOnBackdropPress ? () => close() : undefined} />
      </Animated.View>

      <View style={[styles.bottom, { paddingBottom: keyboardHeight }]} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.sheet,
            {
              transform: [{ translateY }],
              backgroundColor: theme.backgroundElement,
              maxHeight: `${Math.round(maxHeightRatio * 100)}%`,
              // 底部安全区由弹层自己补，不靠外面包 SafeAreaView——包在外面弹层就贴不到屏幕最底下。
              // 取 max 而不是相加：edge-to-edge 下 insets.bottom 已经是导航栏那么高了，
              // 再加一个 Spacing.four 就会在按钮下面留出一条明显的空带
              // 键盘顶上来的时候弹层下面挨着的是键盘、不是导航栏，安全区那一截就不该再留
              paddingBottom: keyboardHeight > 0 ? Spacing.three : Math.max(insets.bottom, Spacing.three),
            },
          ]}>
          {/* 顶部那道短横条：告诉用户这东西是从下面上来的、可以被打发走。
              目前只是视觉提示，还没接手势拖拽 */}
          <View style={[styles.handle, { backgroundColor: theme.backgroundSelected }]} />

          {title || headerRight ? (
            <View style={styles.header}>
              <ThemedText style={styles.title}>{title}</ThemedText>
              {headerRight}
            </View>
          ) : null}
          {children}
        </Animated.View>
      </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  title: {
    flex: 1,
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '700',
  },
});
