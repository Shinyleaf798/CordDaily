import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// 四个入口都是「有地址、不回传值」，所以是路由而不是弹层——可以直接跳、该出现在返回栈里
const ENTRIES = [
  { href: '/settings/ledger' as const, icon: 'book-outline' as const, label: '账本' },
  { href: '/settings/home-layout' as const, icon: 'apps-outline' as const, label: '布局' },
  { href: '/settings/theme' as const, icon: 'color-palette-outline' as const, label: '主题' },
  { href: '/settings/other' as const, icon: 'ellipsis-horizontal' as const, label: '其他' },
];

// 借分类网格那套样式（圆形图标 + 底下一行小字）：这一页和记账页的分类都是"扫一眼挑一个"，
// 长列表读起来更慢。四格一行正好铺满，所以是 25% 而不是分类网格的 20%
export default function SettingsScreen() {
  const theme = useTheme();

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ThemedView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="pageTitle">我的</ThemedText>

          <View style={styles.grid}>
            {ENTRIES.map((entry) => (
              <Pressable key={entry.href} onPress={() => router.push(entry.href)} style={styles.item}>
                <View style={[styles.iconWrap, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}>
                  <Ionicons name={entry.icon} size={22} color={theme.cardHighlight} />
                </View>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {entry.label}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.four },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: Spacing.three,
  },
  item: {
    width: '25%',
    alignItems: 'center',
    gap: Spacing.one,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
