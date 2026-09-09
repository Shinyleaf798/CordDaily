import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuthStore } from '@/store/auth.store';

// 分类管理 / 预算设置 / 周期交易 / 同步设置这几个二级页面还没做，先把入口和登出放这里
export default function SettingsScreen() {
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);

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

        <Pressable onPress={() => clearSession()} style={styles.logoutButton}>
          <ThemedText type="default" style={{ color: '#e5484d' }}>
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
    gap: Spacing.half,
  },
  logoutButton: {
    marginTop: 'auto',
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5484d',
  },
});
