import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// 账本相关的四个二级页的集散地。这里只做转发，每一项自己都是独立路由，
// 也可以从别处直接跳（比如记账页的「设置」格子直通 /categories）
const ENTRIES = [
  { href: '/categories' as const, icon: 'grid-outline' as const, label: '分类管理', hint: '增删改分类和图标，记账页那个「设置」格子通到同一页' },
  { href: '/set-budget' as const, icon: 'cash-outline' as const, label: '预算', hint: '设本月总预算，超支在本地实时计算' },
  { href: '/tags' as const, icon: 'pricetags-outline' as const, label: '标签汇总', hint: '按旅行、装修这类跨分类的事件看花销' },
  { href: '/reimbursements' as const, icon: 'cash-outline' as const, label: '报销', hint: '看现在垫了多少钱还没收回来' },
];

export default function LedgerSettingsScreen() {
  const theme = useTheme();

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['bottom', 'left', 'right']}>
      <ThemedView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          {ENTRIES.map((entry) => (
            <Pressable
              key={entry.href}
              onPress={() => router.push(entry.href)}
              style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
              <Ionicons name={entry.icon} size={20} color={theme.cardHighlight} />
              <View style={styles.rowText}>
                <ThemedText type="default">{entry.label}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {entry.hint}
                </ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: 12,
  },
  rowText: { flex: 1, gap: 2 },
});
