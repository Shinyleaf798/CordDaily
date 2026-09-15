import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { useTheme } from '@/hooks/use-theme';

// 没设预算时的行动入口。两套首页布局都会显示"还没设置预算"，所以"点了去哪"这件事
// 只写在这一个文件里，将来改目的地不用两处都改。
//
// 点开的是 /set-budget 弹窗：填一个总数就完事。预算只有这一种，没有按分类设额度那套。
export function SetBudgetLink() {
  const theme = useTheme();

  return (
    <Pressable
      onPress={() => router.push('/set-budget')}
      // 文字只有 20px 高，靠 hitSlop 把可点区域撑到 44 以上，不靠加 padding 撑开版式
      hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
      style={styles.row}>
      <Ionicons name="cash-outline" size={16} color={theme.cardHighlight} />
      <ThemedText style={[styles.text, { color: theme.cardHighlight }]}>还没设置预算，去设一个</ThemedText>
      <Ionicons name="chevron-forward" size={13} color={theme.cardHighlight} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
});
