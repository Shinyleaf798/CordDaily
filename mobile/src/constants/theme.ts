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
// - cardHighlight：主题强调色（按钮、进度条、色条等），三套主题唯一真正不同的颜色
// - onCardHighlight：铺在 cardHighlight 上的文字/图标颜色，保证对比度
// - income / expense：收入/支出的语义色，跟主题强调色无关，三套主题基本复用同一对红绿
// - cardBorder：目前只给 budget-progress-card 用，跟 backgroundElement 拆开是为了单独调这张卡片的底色，
//   不影响输入框、tab bar、月度总览卡等其他共用 backgroundElement 的地方
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
  },
  blackGold: {
    text: '#ffffff',
    textSecondary: '#a3a3a3',
    background: '#000000',
    backgroundElement: '#1c1c1c',
    backgroundSelected: '#2c2c2c',
    cardBorder: '#1c1c1c',
    cardHighlight: '#d4af37',
    onCardHighlight: '#1a1a1a',
    income: '#32d583',
    expense: '#f97066',
  },
  blackPurple: {
    text: '#ffffff',
    textSecondary: '#a3a3a3',
    background: '#000000',
    backgroundElement: '#1c1c1c',
    backgroundSelected: '#2c2c2c',
    cardBorder: '#1c1c1c',
    cardHighlight: '#a855f7',
    onCardHighlight: '#ffffff',
    income: '#32d583',
    expense: '#f97066',
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

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
