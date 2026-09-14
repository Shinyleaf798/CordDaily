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

export const Colors = {
  whiteColorful: {
    text: '#000000',
    textSecondary: '#60646C',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    accent: '#e8891b',
    accentSecondary: '#f5a95c',
    onAccent: '#ffffff',
    income: '#12b76a',
    expense: '#e5484d',
  },
  blackGold: {
    text: '#f5f0e6',
    textSecondary: '#a89a78',
    background: '#000000',
    backgroundElement: '#1a1712',
    backgroundSelected: '#2b2415',
    accent: '#d4af37',
    accentSecondary: '#f0cf6b',
    onAccent: '#1a1712',
    income: '#32d583',
    expense: '#f97066',
  },
  blackPurple: {
    text: '#f4f0fa',
    textSecondary: '#a898c4',
    background: '#000000',
    backgroundElement: '#180f24',
    backgroundSelected: '#2a1d40',
    accent: '#a855f7',
    accentSecondary: '#c9a6ff',
    onAccent: '#ffffff',
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
