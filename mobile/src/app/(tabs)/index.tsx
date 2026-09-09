import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuthStore } from '@/store/auth.store';

// 首页：月度收支总览 + 预算进度 + 近7天账单，等 transactions 本地读写和同步做完再接真数据
export default function HomeScreen() {
  const user = useAuthStore((s) => s.user);

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ThemedView style={{ flex: 1, padding: Spacing.four, gap: Spacing.two }}>
        <ThemedText type="title">Hi{user?.name ? `, ${user.name}` : ''}</ThemedText>
        <ThemedText type="default" themeColor="textSecondary">
          月度收支总览、预算进度、近7天账单会显示在这里。
        </ThemedText>
      </ThemedView>
    </SafeAreaView>
  );
}
