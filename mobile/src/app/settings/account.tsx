import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { ScreenPadding, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/store/auth.store';

/**
 * 账号和登出。原来这是「我的 → 其他」那一页；改版之后「其他」那一格没了，
 * 这一页从页头的头像和「其他」组的「账号」两处都能进来。
 *
 * 内容一个字没变——邮箱一年确认一次，登出更少，它本来就该待在二级页。
 */
export default function AccountSettingsScreen() {
  const theme = useTheme();
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);

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

          {/* 登出前不提醒"还有 N 笔没备份"：这个 App 的账在本地库里，登出不会清库，
              再登回来账还在。真正该提醒的地方是备份卡，它一直在首页上挂着 */}
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
