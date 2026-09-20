import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * 软键盘当前占多高，收起时是 0。
 *
 * 为什么需要它：Android 从 SDK 54 起 edge-to-edge 是强制开的，
 * `softwareKeyboardLayoutMode: 'resize'` 那套"窗口自己缩上去"的行为不再成立——
 * 窗口始终是整屏，键盘直接盖在内容上。固定贴在屏幕底部的面板（记账页那半屏）
 * 于是会被整个盖住，输入框看不见自己在打什么字。
 *
 * 用 Did 而不是 Will：`keyboardWillShow` 只有 iOS 发，Android 收不到。
 * iOS 上多监听一个 Will，让面板跟着键盘一起动而不是等它弹完再跳一下。
 */
export function useKeyboardHeight(): number {
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

  return height;
}
