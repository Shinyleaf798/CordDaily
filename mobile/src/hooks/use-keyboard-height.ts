import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * **键盘顶边离屏幕底边有多远**，收起时是 0。
 *
 * 为什么需要它：Android 从 SDK 54 起 edge-to-edge 是强制开的，
 * `softwareKeyboardLayoutMode: 'resize'` 那套"窗口自己缩上去"的行为不再成立——
 * 窗口始终是整屏，键盘直接盖在内容上。固定贴在屏幕底部的面板（记账页那半屏）
 * 于是会被整个盖住，输入框看不见自己在打什么字。
 *
 * 用 Did 而不是 Will：`keyboardWillShow` 只有 iOS 发，Android 收不到。
 * iOS 上多监听一个 Will，让面板跟着键盘一起动而不是等它弹完再跳一下。
 *
 * **Android 上要把底部安全区加回去。** `endCoordinates.height` 报的是键盘自己那个窗口的高度，
 * **不含导航栏那一截**；而任何"我离屏幕底边多远"的布局计算都是从物理屏底量起的。
 * 两把尺子零点差一条导航栏，结果就是面板永远差那么一点点顶不上去——
 * 在三键导航的机器上就是 47dp，正好吃掉最底下那一行输入框。
 *
 * 实测（Xiaomi，三键导航，搜狗输入法）：报 327，而键盘顶边实际离屏底 ≈374，
 * 差值 47 = `insets.bottom`。iOS 不加：那边 `endCoordinates` 本来就是屏幕坐标，
 * 已经含了底部指示条那一截，再加一次会顶过头。
 *
 * **报的高度可能是负数，而且必须照样走修正。** 输入法接管了硬件键盘时
 * （模拟器 `hw.keyboard=yes`、平板接实体键盘），Gboard 只给一条悬浮工具条，
 * IME 窗口整个留在屏幕外：实测报 -24，`insets.bottom` 也是 24，
 * 加回去正好是 0——"键盘没占地方"。早先这里写的是 `height > 0 && ...`，
 * 负数不满足条件于是原样返回，调用方拿 -24 当内边距用，面板反而往下沉 12dp。
 * 修正公式对负数一样成立，该夹的是修正**之后**的结果，不是之前。
 *
 * 用 `null` 而不是 0 表示"收起"：0 是一个合法的测量值（上面那种悬浮键盘），
 * 跟"没有键盘"必须分得开，否则收起时会平白加一条 `insets.bottom` 的偏移。
 */
export function useKeyboardHeight(): number {
  const insets = useSafeAreaInsets();
  const [reported, setReported] = useState<number | null>(null);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const show = Keyboard.addListener(showEvent, (e) => setReported(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setReported(null));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  if (reported === null) return 0;

  const corrected = Platform.OS === 'android' ? reported + insets.bottom : reported;
  // 夹在 0 以上：负的内边距/位移没有意义，只会把面板推到反方向去
  return Math.max(0, corrected);
}
