import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

// 支出/收入/转账切换、两级分类网格、金额键盘、标签行——这个表单是下一步要做的重头戏，先占位
export default function AddScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ThemedView style={{ flex: 1, padding: Spacing.four }}>
        <ThemedText type="title">添加账单</ThemedText>
        <ThemedText type="default" themeColor="textSecondary">
          支出 / 收入 / 转账的记账表单会在这里。
        </ThemedText>
      </ThemedView>
    </SafeAreaView>
  );
}
