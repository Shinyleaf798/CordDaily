import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ModalBackdrop } from '@/components/ui/modal-backdrop';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
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
 *
 * **键盘避让：只保证聚焦的那个输入框看得见，别的一概不管。**
 * 参照物是**输入框的底边**，不是卡片底边。拿卡片底边当参照的话，只要卡片够高，
 * 底边就必然被键盘盖住，于是必然抬——哪怕输入框本来就在键盘上方老远。
 * 分类对话框就是这样：输入框在第一行，下面挂着 200 高的图标网格和按钮，
 * 一聚焦整张卡就被推起来，而用户盯着的那一行根本没被挡过。
 *
 * 代价是抬起后卡片下半截会被键盘盖住（图标网格、保存按钮）。这是故意选的：
 * 收键盘是一个动作，而打字的时候看不见自己打的字没法补救。
 *
 * **不用 KeyboardAvoidingView，也不用 padding，用 transform。**
 * 原来 Android 走 `behavior="height"`，靠改容器高度让位；改高度就是让整棵子树
 * 重新布局，里面的 TextInput 跟着重新测量，焦点会在重排途中掉。焦点一掉 Android
 * 就收键盘，收了用户再点，于是抖成一片。logcat 里能抓到 App 侧那条
 * `ORIGIN_CLIENT / fromUser false` 的 hide——没人碰屏幕，是代码发的。
 *
 * `transform` 只改画到屏幕上的位置，布局尺寸一个都不变，所以连 onLayout 都不会
 * 再触发，测量值不会因为自己的位移而变化，也就没有回路。
 */
export function ModalDialog({ title, onDismiss, dismissOnBackdropPress = true, children }: ModalDialogProps) {
  const theme = useTheme();
  const keyboardHeight = useKeyboardHeight();
  // 两个都是窗口坐标系里的数：外壳多高、卡片的上下边各在哪
  const [hostHeight, setHostHeight] = useState(0);
  const [card, setCard] = useState({ top: 0, bottom: 0 });

  // 聚焦输入框的底边（同一套窗口坐标）。没有输入框聚焦时是 null，参照物退回卡片底边
  const [inputBottom, setInputBottom] = useState<number | null>(null);
  // 当前位移，只给下面那个异步测量回调读
  const liftRef = useRef(0);

  const keyboardTop = hostHeight - keyboardHeight;
  const mustSeeBottom = inputBottom ?? card.bottom;
  // 加一道缝，不然输入框下边缘正好贴着键盘顶边
  const covered = keyboardHeight > 0 && hostHeight > 0 ? mustSeeBottom + Spacing.two - keyboardTop : 0;
  // 上限取 card.top：抬过头会把标题顶出屏幕，那是拿一个看不见换另一个看不见
  const lift = Math.max(0, Math.min(covered, card.top));

  // 输入框在调用方的子树里，这一层挂不上 onLayout，只能自己去量。
  // 挂在键盘事件上而不是写成「跟着 keyboardHeight 变就量」：键盘是外部系统，
  // 在它的回调里 setState 才是 effect 的正常用法——effect 体里同步 setState 会级联渲染。
  // 事件名的选法跟 use-keyboard-height 一致：Will 只有 iOS 发得出来。
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const show = Keyboard.addListener(showEvent, () => {
      // 用 currentlyFocusedInput 而不是让调用方传 ref 进来：所有对话框自动生效，一个调用点都不用改
      const input = TextInput.State.currentlyFocusedInput();
      if (!input) {
        setInputBottom(null);
        return;
      }
      // measureInWindow 报的是「画到屏幕上」的位置，已经含了卡片当前的 translateY。
      // 把 lift 加回去还原成没位移时的坐标，否则测量值会喂给产生它的那个位移，
      // 每次键盘事件都往上爬一截——上面 transform 那段说的回路，换个入口又长出来
      input.measureInWindow((_x, y, _width, height) => setInputBottom(y + height + liftRef.current));
    });
    const hide = Keyboard.addListener(hideEvent, () => setInputBottom(null));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // 等测量回调异步落回来时，liftRef 里是「屏幕上这一帧」的位移，
  // 跟 measureInWindow 量到的位置对得上
  useEffect(() => {
    liftRef.current = lift;
  }, [lift]);

  return (
    <View style={styles.root} onLayout={(e) => setHostHeight(e.nativeEvent.layout.height)}>
      <ModalBackdrop onPress={dismissOnBackdropPress ? onDismiss : undefined} />

      {/* box-none：让点在卡片外、但在这层里的位置穿透到底下的遮罩上，否则点空白关不掉 */}
      <View style={styles.center} pointerEvents="box-none">
        <View
          onLayout={(e) => {
            const { y, height } = e.nativeEvent.layout;
            // 值没变就返回原对象：onLayout 每次都给新对象，照单全收会白白多渲染一轮
            setCard((prev) => (prev.top === y && prev.bottom === y + height ? prev : { top: y, bottom: y + height }));
          }}
          style={[styles.dialog, { backgroundColor: theme.backgroundElement, transform: [{ translateY: -lift }] }]}>
          {title ? <ThemedText style={styles.title}>{title}</ThemedText> : null}
          {children}
        </View>
      </View>
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
