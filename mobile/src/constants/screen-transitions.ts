import type { StackNavigationOptions } from 'expo-router/js-stack';

/**
 * 页面切换动画的预设，直接喂给 <Stack.Screen options={...}>。
 *
 * 集中放在这里而不是散在各个 Stack.Screen 上，是为了让"同一类页面用同一种动画"成为默认结果：
 * 动画不一致的界面会让人觉得 App 是拼出来的，而这种不一致往往不是有意的，只是写的时候忘了对齐。
 *
 * presentation 和 animation 是两件事，别混：
 * - presentation 决定这一屏「怎么摆」——盖住底下（modal）还是透出底下（transparentModal）
 * - animation   决定它「怎么进来」——淡入、从下滑、从右推
 * 窗口多大、摆在屏幕哪个位置，两者都不管，那是页面自己的布局决定的。
 *
 * 喂给的是 JS 栈（expo-router/js-stack）：两端表现一致，不再有"Android 回落成平台默认"这回事。
 * 想完全自定义就把 animation 换成 cardStyleInterpolator + transitionSpec（同样从 js-stack 导出）。
 * satisfies 而不是 as const：保住字面量类型的同时，写错选项名编译期就报。
 */
export const ScreenTransitions = {
  /** 居中对话框：透出底下那一屏 + 原地淡入。配 components/ui/modal-dialog 用 */
  dialog: {
    presentation: 'transparentModal',
    animation: 'fade',
    headerShown: false,
  },

  /** 底部弹层：透出底下那一屏 + 从下滑入。配 components/ui/modal-sheet 用 */
  sheet: {
    presentation: 'transparentModal',
    animation: 'slide_from_bottom',
    headerShown: false,
  },

  /**
   * 整页 modal：系统级弹窗，从下往上盖住底下那一屏。目前没人用。
   *
   * 记一笔原来走这个，后来换成了 push——它是一条"进去做完事再出来"的流程，
   * 不是一个需要强调"你正被打断"的弹窗。
   * JS 栈上 animation 写了就盖过 presentation 挑的默认动画，不像原生栈那样被 modal 吃掉。
   */
  fullScreenModal: {
    presentation: 'modal',
  },

  /**
   * 普通二级页：从右滑入，返回时原路滑回右边。
   *
   * 记一笔、分类管理都走这个：它们是"进去做完事再出来"的页面，
   * 左右滑的方向本身就在表达"我进到更深一层了 / 我退回来了"。
   */
  push: {
    animation: 'slide_from_right',
  },

  /** 互为替代的两个页面（login <-> register）：原地淡入，不做左右推——它们是平级的，不是上下级 */
  crossFade: {
    headerShown: false,
    animation: 'fade',
  },

  /** 不要动画。用于 tab 之间这种本来就不该有转场的地方 */
  none: {
    animation: 'none',
  },
} satisfies Record<string, StackNavigationOptions>;
