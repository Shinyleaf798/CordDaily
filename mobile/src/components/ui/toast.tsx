import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** 显示多久之后开始淡出（毫秒）。够读完一句短话，又不至于让人等着它消失 */
const HOLD_MS = 1600;
const FADE_IN_MS = 140;
const FADE_OUT_MS = 320;

/**
 * 一条从底部浮出来、自己淡掉的短消息。
 *
 * **它只配"说一句就算了"的事**：操作成功但没有结果要看、点了一个当下做不了的按钮、
 * 复制好了。凡是用户可能需要回头确认、或者需要做点什么的，都该用 TaskDialog——
 * 那个要手动关掉，所以不会被错过。toast 会自己消失，错过了就是错过了。
 *
 * 不做成全局的 Provider：现在只有一处在用，而全局 toast 的麻烦在于**谁来决定层级**——
 * 它要盖在弹层上面还是下面，得由那个页面自己回答。做成一个普通组件，
 * 页面把它放在自己 JSX 的哪一行，就是那个答案。
 */
type ToastMessage = { id: number; text: string } | null;

export function useToast() {
  const [toast, setToast] = useState<ToastMessage>(null);
  // 每次都给一个新 id：同一句话连点两次也要重新计时，否则第二下看起来像没反应
  const nextId = useRef(0);

  const show = useCallback((text: string) => {
    nextId.current += 1;
    setToast({ id: nextId.current, text });
  }, []);

  const clear = useCallback(() => setToast(null), []);

  return { toast, show, clear };
}

export function Toast({ toast, onHide }: { toast: ToastMessage; onHide: () => void }) {
  const theme = useTheme();
  // useState(() => …) 而不是 useRef().current：在 render 里读 ref 会被 react-hooks/refs 拦下，
  // 而且 React Compiler 开着时那种写法本来就不保证安全。项目里 modal-sheet 也是这个写法
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!toast) return;

    // 每条从 0 开始：上一条可能还没淡完就被新的顶掉了
    opacity.setValue(0);
    const animation = Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: FADE_IN_MS, useNativeDriver: true }),
      Animated.delay(HOLD_MS),
      Animated.timing(opacity, { toValue: 0, duration: FADE_OUT_MS, useNativeDriver: true }),
    ]);
    // finished 为假 = 被 cleanup 停掉了（换了一条，或者页面走了）。
    // 那种情况不能调 onHide：它会把**新**的那条也一起清掉
    animation.start(({ finished }) => {
      if (finished) onHide();
    });

    return () => animation.stop();
  }, [toast, onHide, opacity]);

  if (!toast) return null;

  return (
    // pointerEvents="none"：它浮在页面上，但不该挡住底下的东西。
    // 没有关闭按钮也是同一个意思——这条消息不要求任何回应
    <Animated.View pointerEvents="none" style={[styles.wrap, { opacity }]}>
      <ThemedText type="small" style={[styles.text, { backgroundColor: theme.backgroundSelected, color: theme.text }]}>
        {toast.text}
      </ThemedText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    // 离底边留一截：贴着底边会跟系统手势条和 tab bar 挤在一起
    bottom: 48,
    alignItems: 'center',
  },
  // 底色直接画在文字上，不另包一层 View：这条消息永远是一行短话，
  // 包一层只是为了同一组内距
  text: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
