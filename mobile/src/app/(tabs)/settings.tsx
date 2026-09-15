import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, ThemeLabels, ThemeNames } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/store/auth.store';
import { useThemeStore } from '@/store/theme.store';

// 分类管理 / 预算设置 / 周期交易 / 同步设置这几个二级页面还没做，先把入口和登出放这里
export default function SettingsScreen() {
  const theme = useTheme();
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);
  const themeName = useThemeStore((s) => s.themeName);
  const setThemeName = useThemeStore((s) => s.setThemeName);

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ThemedView style={styles.container}>
        <ThemedText type="title">我的</ThemedText>

        <View style={styles.card}>
          <ThemedText type="default">{user?.email}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            基准货币 {user?.baseCurrency}
          </ThemedText>
        </View>

        <View style={styles.card}>
          <ThemedText type="small" themeColor="textSecondary">
            账本
          </ThemedText>
          {[
            { href: '/budgets' as const, icon: 'pie-chart-outline' as const, label: '预算', hint: '按分类设额度，超支在本地实时计算' },
            { href: '/tags' as const, icon: 'pricetags-outline' as const, label: '标签汇总', hint: '按旅行、装修这类跨分类的事件看花销' },
            { href: '/reimbursements' as const, icon: 'cash-outline' as const, label: '报销', hint: '看现在垫了多少钱还没收回来' },
          ].map((entry) => (
            <Pressable
              key={entry.href}
              onPress={() => router.push(entry.href)}
              style={[styles.linkRow, { backgroundColor: theme.backgroundElement }]}>
              <Ionicons name={entry.icon} size={20} color={theme.cardHighlight} />
              <View style={styles.linkText}>
                <ThemedText type="default">{entry.label}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {entry.hint}
                </ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
            </Pressable>
          ))}
        </View>

        <View style={styles.card}>
          <ThemedText type="small" themeColor="textSecondary">
            主题
          </ThemedText>
          <View style={styles.themeRow}>
            {ThemeNames.map((name) => (
              <Pressable
                key={name}
                onPress={() => setThemeName(name)}
                style={[
                  styles.themeChip,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: name === themeName ? theme.cardHighlight : 'transparent',
                  },
                ]}>
                <ThemedText type="small">{ThemeLabels[name]}</ThemedText>
              </Pressable>
            ))}
          </View>
        </View>

        <Pressable onPress={() => clearSession()} style={[styles.logoutButton, { borderColor: theme.expense }]}>
          <ThemedText type="default" style={{ color: theme.expense }}>
            退出登录
          </ThemedText>
        </Pressable>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.four,
    gap: Spacing.four,
  },
  card: {
    gap: Spacing.two,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: 12,
  },
  linkText: {
    flex: 1,
    gap: 2,
  },
  themeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  themeChip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 10,
    borderWidth: 2,
  },
  logoutButton: {
    marginTop: 'auto',
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
