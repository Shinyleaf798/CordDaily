import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ProfileHeaderProps = {
  email: string | undefined;
  transactionCount: number;
  firstTransactionDate: string | null;
};

/**
 * 「我的」页最上面那一条：你是谁 + 你记了多久。
 *
 * 头像是邮箱首字母，不是图片——这个 App 没有头像上传（真要做得先接图床，那是另一件事），
 * 而一个纯色圆比一个灰色的默认人像更像"有意为之"。
 *
 * 「记账第 N 天」从**最早一笔账**算起，不是注册时间：用户认的是"我记了多久"，
 * 而不是"我什么时候注册的这个账号"。一笔账都没有时整行不显示——
 * 「记账第 1 天 · 共 0 笔」是句废话，还会让空库看起来像出了错。
 */
export function ProfileHeader({ email, transactionCount, firstTransactionDate }: ProfileHeaderProps) {
  const theme = useTheme();

  const name = email?.split('@')[0] ?? '我';
  const initial = (name[0] ?? '?').toUpperCase();

  const days = firstTransactionDate ? daysSince(firstTransactionDate) : null;

  return (
    <Pressable
      onPress={() => router.push('/settings/account')}
      style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <View style={[styles.avatar, { backgroundColor: theme.cardHighlight }]}>
        <ThemedText type="pageTitle" style={{ color: theme.onCardHighlight }}>
          {initial}
        </ThemedText>
      </View>

      <View style={styles.text}>
        <ThemedText type="default" numberOfLines={1}>
          {name}
        </ThemedText>
        {days !== null ? (
          <ThemedText type="small" themeColor="textSecondary">
            记账第 {days} 天 · 共 {transactionCount} 笔
          </ThemedText>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            还没有账单，去记第一笔吧
          </ThemedText>
        )}
      </View>

      <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
    </Pressable>
  );
}

// 按**日历天**算，不是按 24 小时：昨天晚上记的第一笔，今天早上该显示"第 2 天"而不是"第 1 天"
function daysSince(isoDate: string): number {
  const first = new Date(isoDate);
  const startOfFirstDay = new Date(first.getFullYear(), first.getMonth(), first.getDate());
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.round((startOfToday.getTime() - startOfFirstDay.getTime()) / 86400000);
  return Math.max(diff + 1, 1);
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: 14,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
});
