import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { HomeLayoutHints, HomeLayoutLabels, HomeLayoutNames } from '@/constants/home-layout';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useHomeLayoutStore } from '@/store/home-layout.store';

// 首页布局跟主题是两个独立设置：布局管结构、主题管配色，可以任意组合，所以分成两页
export default function HomeLayoutSettingsScreen() {
  const theme = useTheme();
  const layoutName = useHomeLayoutStore((s) => s.layoutName);
  const setLayoutName = useHomeLayoutStore((s) => s.setLayoutName);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['bottom', 'left', 'right']}>
      <ThemedView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          {HomeLayoutNames.map((name) => (
            <Pressable
              key={name}
              onPress={() => setLayoutName(name)}
              style={[
                styles.row,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: name === layoutName ? theme.cardHighlight : 'transparent',
                },
              ]}>
              <View style={styles.rowText}>
                <ThemedText type="default">{HomeLayoutLabels[name]}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {HomeLayoutHints[name]}
                </ThemedText>
              </View>
              {name === layoutName ? (
                <Ionicons name="checkmark-circle" size={20} color={theme.cardHighlight} />
              ) : null}
            </Pressable>
          ))}
        </ScrollView>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.two },
  // 选中态用描边表示，跟主题页保持一致
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: 12,
    borderWidth: 2,
  },
  rowText: { flex: 1, gap: 2 },
});
