import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { ScreenPadding, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/store/auth.store';

/**
 * 账号：没登录时是登录/注册的入口，登录了是邮箱和退出登录。
 *
 * **这一页是整个 App 里唯一强制要账号的地方**——记账、统计、导出文件、从文件恢复
 * 全都不需要登录（见根布局那段注释）。登录只买一样东西：云端。
 */
export default function AccountSettingsScreen() {
  const theme = useTheme();
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['bottom', 'left', 'right']}>
      <ThemedView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          {user ? (
            <>
              <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText type="small" themeColor="textSecondary">
                  账号
                </ThemedText>
                <ThemedText type="default">{user.email}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  基准货币 {user.baseCurrency}
                </ThemedText>
              </View>

              {/* 登出前不提醒"还有 N 笔没备份"：这个 App 的账在本地库里，登出不会清库，
                  再登回来账还在。真正该提醒的地方是备份卡，它一直在「我的」页上挂着 */}
              <Pressable onPress={() => clearSession()} style={[styles.logoutButton, { borderColor: theme.expense }]}>
                <ThemedText type="default" style={{ color: theme.expense }}>
                  退出登录
                </ThemedText>
              </Pressable>
            </>
          ) : (
            <>
              <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText type="default">还没登录</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  记账、统计、导出文件都不需要账号。登录只为一件事：把账备份到云端，
                  换手机或重装时能拉回来。
                </ThemedText>
              </View>

              <Pressable
                onPress={() => router.push('/login')}
                style={[styles.primaryButton, { backgroundColor: theme.cardHighlight }]}>
                <ThemedText type="default" style={{ color: theme.onCardHighlight }}>
                  登录
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => router.push('/register')}
                style={[styles.logoutButton, { borderColor: theme.backgroundSelected }]}>
                <ThemedText type="default">注册新账号</ThemedText>
              </Pressable>
            </>
          )}
        </ScrollView>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: ScreenPadding, paddingVertical: Spacing.four, gap: Spacing.four },
  card: { padding: Spacing.three, borderRadius: 12, gap: Spacing.one },
  primaryButton: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  logoutButton: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
