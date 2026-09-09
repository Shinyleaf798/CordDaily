import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

// 日历：按天查看消费记录，等本地 transactions 读写做完再接真数据
export default function CalendarScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ThemedView style={{ flex: 1, padding: Spacing.four, gap: Spacing.two }}>
        <ThemedText type="title">日历</ThemedText>
        <ThemedText type="default" themeColor="textSecondary">
          按天查看消费记录会显示在这里。
        </ThemedText>
      </ThemedView>
    </SafeAreaView>
  );
}
