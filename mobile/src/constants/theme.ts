/**
 * 三套可切换的应用主题（不跟随系统深色模式，用户在"我的"页手动选择，选择持久化在 theme.store）。
 * 每个主题一套完整色板，key 保持一致，方便 useTheme() 直接换源不用改调用方代码。
 */

import { Platform } from 'react-native';

export type ThemeName = 'whiteColorful' | 'blackGold' | 'blackPurple';

export const ThemeNames: ThemeName[] = ['whiteColorful', 'blackGold', 'blackPurple'];

export const ThemeLabels: Record<ThemeName, string> = {
  whiteColorful: '白色·彩色',
  blackGold: '黑金',
  blackPurple: '黑紫',
};

// 导航栏外观（expo-router ThemeProvider 用 light/dark 决定系统控件底色）跟色板本身分开存，
// 避免这个 key 混进 Colors 对象后被 ThemeColor 类型和 ThemedView/ThemedText 的 type prop 误当成一种颜色
export const ThemeScheme: Record<ThemeName, 'light' | 'dark'> = {
  whiteColorful: 'light',
  blackGold: 'dark',
  blackPurple: 'dark',
};

// 各 token 的用途（三套主题里语义一致，只是取值不同）：
// - text / textSecondary：主/次文字颜色
// - background：页面底色
// - backgroundElement：卡片、输入框等"表面"背景色，比 background 深一级，靠色差而不是描边区分层次
// - backgroundSelected：再深一级，用于选中态背景（如已选 chip）和分隔线/描边颜色（borderColor 系列）
//
// 两套深色主题的这三级中性色**必须一起动**：它们表达的是"离页面底色多远"这一件事，
// 只把卡片提亮一级，选中态就会跟卡片贴到一起、预算卡（走 cardBorder）会比别的卡片暗一截。
// 2026-09-30 先从 1c/2c/1c 提到 24/36/24（纯黑底上 #1c1c1c 几乎浮不起来），
// 同一天又压回 16/2a/16：24 那一版卡片是看得见了，但一屏五六张浅灰块摆在纯黑上，
// 读起来是"一堆框"而不是"一页账"。现在卡片边界交给圆角和内容自己交代，不靠色差喊出来。
// 代价是暗光下卡片几乎贴着底色——这一版必须在真机上验，截图里看不出来
// - cardHighlight：主题强调色（按钮、进度条、色条等），三套主题唯一真正不同的颜色
// - onCardHighlight：铺在 cardHighlight 上的文字/图标颜色，保证对比度
// - income / expense：收入/支出的语义色，跟主题强调色无关，三套主题基本复用同一对红绿
// - cardBorder：目前只给 budget-progress-card 用，跟 backgroundElement 拆开是为了单独调这张卡片的底色，
//   不影响输入框、tab bar、月度总览卡等其他共用 backgroundElement 的地方
// - tabTrackBackground：分段控件（如收支类型切换）的轨道底色，选中项用 background 铺出高亮块
export const Colors = {
  whiteColorful: {
    text: '#000000',
    textSecondary: '#60646C',
    background: '#F0F0F3',
    backgroundElement: '#ffffff',
    backgroundSelected: '#E0E1E6',
    cardBorder: '#ffffff',
    cardHighlight: '#f5a95c',
    onCardHighlight: '#ffffff',
    income: '#12b76a',
    expense: '#e5484d',
    tabTrackBackground: '#E0E1E6',
  },
  blackGold: {
    text: '#ffffff',
    textSecondary: '#a3a3a3',
    background: '#000000',
    backgroundElement: '#161616',
    backgroundSelected: '#2a2a2a',
    cardBorder: '#161616',
    cardHighlight: '#d4af37',
    onCardHighlight: '#1a1a1a',
    income: '#32d583',
    expense: '#f97066',
    tabTrackBackground: '#4d4d4d',
  },
  blackPurple: {
    text: '#ffffff',
    textSecondary: '#a3a3a3',
    background: '#000000',
    backgroundElement: '#161616',
    backgroundSelected: '#2a2a2a',
    cardBorder: '#161616',
    cardHighlight: '#a855f7',
    onCardHighlight: '#ffffff',
    income: '#32d583',
    expense: '#f97066',
    tabTrackBackground: '#4d4d4d',
  },
} as const;

export type ThemeColor = keyof typeof Colors.whiteColorful & keyof typeof Colors.blackGold & keyof typeof Colors.blackPurple;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/**
 * 页面内容距屏幕左右边缘的距离。全 App 只有这一个数，改它就等于改全部页面。
 *
 * 不复用 Spacing 里的某一档：Spacing 是**间距刻度**，同一档会同时被用作卡片内距、
 * 行间距、图标间隙。把屏幕边距也挂在 Spacing.three 上，就意味着"想让页面窄一点"
 * 这个念头没法单独表达——一动它，所有卡片内部也跟着缩。
 *
 * 2026-09-30 从 12 收到 8：首页整页都是卡片，而卡片自己已经有 16~20 的内距，
 * 外面再留 12，一个数字离屏幕边缘就有 30px 以上——读起来是"东西被框在中间"，
 * 而不是"一页账铺满了屏幕"。
 */
export const ScreenPadding = 8;

/**
 * 页面内容的**纵向节奏**：标题条底下留多少、块与块之间隔多少，都是这一个数。
 *
 * 跟 `ScreenPadding` 配成一对——横向一个数、纵向一个数，改一个全 App 一起变。
 * 在这之前纵向是四个独立决定：首页/日历/统计 `gap: 12`、我的 `gap: 16`、
 * 顶部内距各页写字面量 12。没人是故意的，只是没人管，切 tab 时节奏就会变一下。
 *
 * 只管**容器级**的间距。布局内部自己的韵律不归它——比如金环布局里
 * 圆环、pill、迷你卡各有各的 marginTop（18/18/12），那是那一页的设计，不是漏统一。
 */
export const ScreenGap = 8;

/**
 * 内容底部要空出来的高度。
 *
 * 不是 gap，所以不跟 `ScreenGap` 共用一个数：底部 tab bar 中间那颗 ＋ 按钮
 * 往上凸出 24（`custom-tab-bar` 里的 `marginTop: -24`），压在内容上面。
 * 这一段是给它让的位置，跟「块与块之间隔多远」是两件事。
 */
export const ScreenBottomInset = 64;

// 没有任何地方在用。留着不删（等核心功能做完一次性清），但别拿它当底部留白——
// 那件事现在是 ScreenBottomInset
export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
