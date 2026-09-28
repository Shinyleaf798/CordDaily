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
 */
export function useKeyboardHeight(): number {
  const insets = useSafeAreaInsets();
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const show = Keyboard.addListener(showEvent, (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setHeight(0));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // 收起时保持 0：那一刻没有"键盘顶边"可言，加上安全区会变成一个凭空的偏移
  return height > 0 && Platform.OS === 'android' ? height + insets.bottom : height;
}
