import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { ScreenPadding, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/store/auth.store';

// 账号和登出。放在「其他」而不是首页顶部，是因为这两样都不是日常要看的东西——
// 邮箱一年确认一次，登出更少
export default function OtherSettingsScreen() {
  const theme = useTheme();
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['bottom', 'left', 'right']}>
      <ThemedView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="small" themeColor="textSecondary">
              账号
            </ThemedText>
            <ThemedText type="default">{user?.email}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              基准货币 {user?.baseCurrency}
            </ThemedText>
          </View>

          <Pressable onPress={() => clearSession()} style={[styles.logoutButton, { borderColor: theme.expense }]}>
            <ThemedText type="default" style={{ color: theme.expense }}>
              退出登录
            </ThemedText>
          </Pressable>
        </ScrollView>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: ScreenPadding, paddingVertical: Spacing.four, gap: Spacing.four },
  card: { padding: Spacing.three, borderRadius: 12, gap: 2 },
  logoutButton: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
