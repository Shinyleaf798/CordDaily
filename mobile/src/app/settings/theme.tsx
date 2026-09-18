import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { Colors, Spacing, ThemeLabels, ThemeNames } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useThemeStore } from '@/store/theme.store';

// 每一项自带一小条色板预览：主题之间真正的差别就是 cardHighlight 那一个颜色，
// 光看名字选不出来，得让人看见它长什么样
export default function ThemeSettingsScreen() {
  const theme = useTheme();
  const themeName = useThemeStore((s) => s.themeName);
  const setThemeName = useThemeStore((s) => s.setThemeName);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['bottom', 'left', 'right']}>
      <ThemedView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          {ThemeNames.map((name) => {
            const palette = Colors[name];
            return (
              <Pressable
                key={name}
                onPress={() => setThemeName(name)}
                style={[
                  styles.row,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: name === themeName ? theme.cardHighlight : 'transparent',
                  },
                ]}>
                <View style={[styles.swatch, { backgroundColor: palette.background, borderColor: palette.backgroundSelected }]}>
                  <View style={[styles.swatchDot, { backgroundColor: palette.cardHighlight }]} />
                </View>
                <ThemedText type="default" style={styles.rowText}>
                  {ThemeLabels[name]}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: 12,
    borderWidth: 2,
  },
  rowText: { flex: 1 },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchDot: { width: 18, height: 18, borderRadius: 9 },
});
