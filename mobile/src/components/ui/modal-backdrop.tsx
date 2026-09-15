import { BlurView } from 'expo-blur';
import { Pressable, StyleSheet, View } from 'react-native';

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
// 平台差异：BlurView 在 iOS 上能直接糊到底下那一屏；Android 需要把被糊的内容包进
// BlurTargetView，而弹层和底下那屏是两个路由，跨路由包不了。所以下面垫了一层半透明黑，
// iOS 得到真毛玻璃，Android 至少得到"背景被压暗"，两端都不会出现"遮罩看不见"的情况。
export function ModalBackdrop({ onPress, intensity = 40 }: ModalBackdropProps) {
  const themeName = useThemeStore((s) => s.themeName);

  return (
    <Pressable style={StyleSheet.absoluteFill} onPress={onPress} disabled={!onPress}>
      <BlurView
        intensity={intensity}
        tint={ThemeScheme[themeName] === 'dark' ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, styles.scrim]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // 固定黑色，不跟主题走：遮罩的作用是把背景压暗好让弹层浮起来，
  // 白色主题下用浅色遮罩就完全失去了这个作用
  scrim: {
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
});
