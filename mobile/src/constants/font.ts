import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Platform, type TextStyle } from 'react-native';

/**
 * 全 App 统一的字体。跟色板主题（constants/theme.ts）是两个正交的维度，存法也一样（store/font.store）。
 *
 * **选的只是数字和英文那一套**：Inter 这类拉丁字体里根本没有汉字，汉字由系统自动补成系统黑体。
 * 所以「字体」实际管的是金额、日期、RM、账户名里的英文——正是首页和「我的」原来对不上的那部分
 * （首页用系统默认，「我的」单独写死了 Android 窄体）。中文字体不给选：
 * 换宋体要把约 10 MB 的字体打进安装包，只为一个口味不值。
 */
export type FontName = 'system' | 'condensed' | 'inter';

export const FontNames: FontName[] = ['system', 'condensed', 'inter'];

export const FontLabels: Record<FontName, string> = {
  system: '系统默认',
  condensed: '系统窄体',
  inter: 'Inter',
};

export const FontHints: Record<FontName, string> = {
  system: '手机自带的那一套',
  condensed: '更窄，长金额也排得下',
  inter: '圆润偏宽，数字更清楚',
};

/**
 * Inter 只打包实际用到的四个字重（全 App 只写过 400~700），每个约 340 KB。
 * 从子路径单独 import，Metro 才不会把另外十四个字重也打进包里
 */
export const InterFontAssets = {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
};

const INTER_BY_WEIGHT: Record<string, keyof typeof InterFontAssets> = {
  '400': 'Inter_400Regular',
  normal: 'Inter_400Regular',
  '500': 'Inter_500Medium',
  '600': 'Inter_600SemiBold',
  '700': 'Inter_700Bold',
  bold: 'Inter_700Bold',
};

/**
 * 把「用哪套字体」+「这段字多粗」翻译成 RN 能认的样式。
 *
 * Inter 是按字重拆开的四个文件，每个文件就是一个 fontFamily，所以字重要靠**换文件**而不是 fontWeight 表达；
 * 留着 fontWeight 的话 Android 会在已经是粗体的文件上再假加粗一遍，笔画糊成一团。
 * 系统的两套则正相反：一个 family 名，粗细交给 fontWeight。iOS 没有叫得出名字的系统窄体，退回系统默认
 */
export function fontStyleFor(font: FontName, weight: TextStyle['fontWeight']): TextStyle | null {
  if (font === 'inter') {
    return { fontFamily: INTER_BY_WEIGHT[String(weight ?? '400')] ?? 'Inter_500Medium', fontWeight: 'normal' };
  }
  if (font === 'condensed' && Platform.OS === 'android') {
    return { fontFamily: 'sans-serif-condensed' };
  }
  return null;
}
