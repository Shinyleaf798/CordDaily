import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ProfileHeaderProps = {
  email: string | undefined;
  /** 自定义头像的 uri，没设过传 null——那时候退回邮箱首字母 */
  avatarUri: string | null;
  firstTransactionDate: string | null;
  /**
   * 点下去干什么。**由「我的」页决定，不在这里写死**：去哪儿取决于云端配到哪一步了，
   * 而那是页面知道的事——这个件只知道"一个邮箱和一个天数"。
   */
  onPress: () => void;
};

/**
 * 「我的」页最上面那一条：你是谁 + 你记了多久。
 *
 * 头像可以是用户自己传的图（存在沙盒里，见 db/avatar.ts），没传就退回邮箱首字母。
 * **不做灰色默认人像**：一个纯色圆比它更像"有意为之"，而不是"这里本该有张图但没加载出来"。
 *
 * 「记账第 N 天」从**最早一笔账**算起，不是注册时间：用户认的是"我记了多久"，
 * 而不是"我什么时候注册的这个账号"。一笔账都没有时这一行换成一句招呼——
 * 「记账第 1 天」对一个空库来说是句废话。
 *
 * **笔数不在这儿显示**：备份卡上已经有「1,284 笔」，而且那个数在那里是有用的
 * （它旁边就是"还有 12 笔没备份"）。同一个数在一屏里出现两次，第二次只是噪音。
 *
 * 天数用 `smallBold` 而不是自己写一个字号：它要比原来的灰色小字显眼，
 * 但**必须比名字（`default`，16）小**——第二行盖过第一行的话，这张卡就没有主角了。
 * 字号表里 14 加粗正好卡在这两个要求中间，而自己写 fontSize 是 themed-text
 * 那段注释专门警告过的事：写漏的页面会孤零零地大一圈。
 */
export function ProfileHeader({ email, avatarUri, firstTransactionDate, onPress }: ProfileHeaderProps) {
  const theme = useTheme();

  // 没账号也照样记账（见根布局那段注释），所以这一条要能表达"还没有账号"这个状态，
  // 而不是拿一个假名字糊过去
  const isSignedIn = !!email;
  const name = email?.split('@')[0] ?? '本地账本';
  const initial = isSignedIn ? name[0].toUpperCase() : '·';

  const days = firstTransactionDate ? daysSince(firstTransactionDate) : null;

  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      {avatarUri ? (
        // contentFit=cover 而不是 contain：头像框是圆的，contain 会在方图之外留出底色边，
        // 看起来像图没铺满。cover 裁掉的那点边缘用户挑图时已经用裁剪框决定过了
        <Image source={{ uri: avatarUri }} style={styles.avatar} contentFit="cover" />
      ) : (
        <View style={[styles.avatar, { backgroundColor: theme.cardHighlight }]}>
          <ThemedText type="pageTitle" style={{ color: theme.onCardHighlight }}>
            {initial}
          </ThemedText>
        </View>
      )}

      <View style={styles.text}>
        <ThemedText type="default" numberOfLines={1}>
          {name}
        </ThemedText>
        {/* 有账就把天数放大说出来，**跟登没登录无关**——"我记了多久"是本地的事实。
            一笔都没有时才退回一句招呼，那时候说「记账第 1 天」是废话 */}
        {days !== null ? (
          <ThemedText type="smallBold">记账第 {days} 天</ThemedText>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            {isSignedIn ? '还没有账单，去记第一笔吧' : '连一个自己的数据库，就能备份到云端'}
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
