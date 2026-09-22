import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// 账本相关的三个二级页的集散地。这里只做转发，每一项自己都是独立路由，
// 也可以从别处直接跳（比如记账页的「设置」格子直通 /categories）
//
// 「标签汇总」和「报销」两条挪走了：统计页上已经各有一个入口，
// 同一个页面在两个地方各有一个通道，用户会以为那是两个不同的东西。
//
// 「账户」是从底部 tab 降下来的——它跟分类、标签是同一类东西（给交易贴标签的字典表），
// 本来就该待在这个抽屉里（见 DECISIONS.md）。
const ENTRIES = [
  { href: '/categories' as const, icon: 'grid-outline' as const, label: '分类管理', hint: '增删改分类和图标，记账页那个「设置」格子通到同一页' },
  { href: '/accounts' as const, icon: 'card-outline' as const, label: '账户', hint: '记一笔账时用来选「我用什么付的」：现金、TNG、某张卡' },
  { href: '/set-budget' as const, icon: 'cash-outline' as const, label: '预算', hint: '设本月总预算，超支在本地实时计算' },
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
