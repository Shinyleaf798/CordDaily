import { BlurView } from 'expo-blur';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemeScheme } from '@/constants/theme';
import { useThemeStore } from '@/store/theme.store';

type ModalBackdropProps = {
  onPress?: () => void;
  /** 模糊强度 1-100。对话框用默认值就行，内容多的弹层可以调低一点免得底下糊成一片 */
  intensity?: number;
};

// 弹层背后那一层：毛玻璃 + 压暗 + 点击关闭。对话框和底部弹层共用同一个，
// 保证两种弹层的"背景观感"一致——不一致的话会让人以为是两个不同的东西。
//
// BlurView 只在 iOS 渲染（那边 UIVisualEffectView 直接糊背后内容，不用配置）。
// Android 糊不动——被糊的内容要包进 BlurTargetView，而这里隔着路由甚至隔着原生窗口。
// 必须显式不渲染它：没有 blurTarget 时它不会跳过，而是铺一块 rgba(25,25,25,0.28) 凑成双份压暗。
export function ModalBackdrop({ onPress, intensity = 40 }: ModalBackdropProps) {
  const themeName = useThemeStore((s) => s.themeName);
  const isDark = ThemeScheme[themeName] === 'dark';

  return (
    <Pressable style={StyleSheet.absoluteFill} onPress={onPress} disabled={!onPress}>
      {Platform.OS === 'ios' ? (
        <BlurView
          intensity={intensity}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? SCRIM_DARK : SCRIM_LIGHT }]} />
    </Pressable>
  );
}

// 颜色固定黑（浅色遮罩在白色主题下压不暗），只有浓度分档。
// 纯黑叠加是各通道乘同一系数，只降明度、不改色相和饱和度；
// 但深色主题背景本就是 #000000，遮罩只压得到亮元素，所以要比白色主题淡得多。
const SCRIM_LIGHT = 'rgba(0, 0, 0, 0.45)';
const SCRIM_DARK = 'rgba(0, 0, 0, 0.22)';
