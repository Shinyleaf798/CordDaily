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
 * animation 只在 Android / iOS 生效，web 上忽略。部分值有平台回落（见各项注释）。
 */
export const ScreenTransitions = {
  /** 居中对话框：透出底下那一屏 + 原地淡入。配 components/ui/modal-dialog 用 */
  dialog: {
    presentation: 'transparentModal' as const,
    animation: 'fade' as const,
    headerShown: false,
  },

  /** 底部弹层：透出底下那一屏 + 从下滑入。配 components/ui/modal-sheet 用 */
  sheet: {
    presentation: 'transparentModal' as const,
    animation: 'slide_from_bottom' as const,
    headerShown: false,
  },

  /** 整页表单（如记一笔）：系统 modal，盖住底下那一屏 */
  fullScreenModal: {
    presentation: 'modal' as const,
  },

  /** 普通二级页：从右推入。iOS 是系统默认手感，Android 上这个值会回落成平台默认 */
  push: {
    animation: 'slide_from_right' as const,
  },

  /** 互为替代的两个页面（login <-> register）：原地淡入，不做左右推——它们是平级的，不是上下级 */
  crossFade: {
    headerShown: false,
    animation: 'fade' as const,
  },

  /** 不要动画。用于 tab 之间这种本来就不该有转场的地方 */
  none: {
    animation: 'none' as const,
  },
};
