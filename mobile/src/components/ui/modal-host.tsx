import type { ReactNode } from 'react';
import { Modal } from 'react-native';

type ModalHostProps = {
  visible: boolean;
  /** Android 实体返回键 / 手势返回时调什么 */
  onRequestClose: () => void;
  children: ReactNode;
};

/**
 * 在**当前页面内部**弹一层的壳，里面照样放 ModalDialog / ModalSheet。
 *
 * 为什么不是每个弹层都开一个路由（像 /set-budget 那样）：
 * 路由型弹层拿不回值。选日期、选账户、选图标这几个都是"挑一个东西还给调用方"，
 * 走路由就得为一次性的选择结果多建一个 store，或者把值塞进 URL 参数再解析回来——
 * 都是为了绕开"组件之间传个值"这件本来很简单的事。
 *
 * 判断标准：这一层**有没有自己的地址**。
 * - 有（用户可能从别处直接跳进来、需要出现在返回栈里）→ 开路由，配 ScreenTransitions
 * - 没有（只是当前表单的一步，关掉就没了）→ 用 ModalHost
 *
 * 用 RN 的 Modal 而不是在页面里绝对定位一个 View：Modal 是系统级窗口，
 * 能盖住原生 header 和底部 tab bar，绝对定位的 View 盖不住。
 */
export function ModalHost({ visible, onRequestClose, children }: ModalHostProps) {
  return (
    <Modal
      visible={visible}
      transparent
      // 动画交给里面的内容去做也行，但 fade 对两种壳都说得通：
      // 对话框本来就是淡入的，底部弹层在这一层淡入、内容自己不再动，看起来仍然是"浮上来一层"
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onRequestClose}>
      {children}
    </Modal>
  );
}
