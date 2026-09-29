import { router } from 'expo-router';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { ScreenPadding, Spacing } from '@/constants/theme';
import { useAvatar, useClearAvatar, usePickAvatar } from '@/hooks/use-avatar';
import { useCloudSession, useHasRemote } from '@/hooks/use-cloud';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/store/auth.store';

/**
 * 账号。
 *
 * **这个 App 里没有一个功能是非要账号不可的**——记账、统计、导出文件、从文件恢复
 * 全都不需要（见根布局那段注释）。账号只买一样东西：云端那条通道。
 *
 * 有两种账号，而且它们毫不相干：
 *
 * - **云端账本**（`db/neon/session`）——用户自己 Neon 库里 `User` 表的一行。
 *   这是现在真正在用的那条路，备份直接从手机连到他自己的库。
 * - **后端账号**（`auth.store`）——我那台 Express 服务器发的 JWT。代码原样留着，
 *   但正式包里连不上（没有公网后端），所以这一页不再提供它的入口。
 *   只有以前登过、会话还在的用户才会看到那一档。
 *
 * 所以这一页按"有没有云端账本"分岔，而不是按"登没登录"。用户在云端备份页注册完回到
 * 这里，看到的必须是他刚建的那个账号——**不是一句「还没登录」**。
 */
export default function AccountSettingsScreen() {
  const theme = useTheme();
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);
  const { data: cloudSession } = useCloudSession();
  const { data: hasRemote } = useHasRemote();

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['bottom', 'left', 'right']}>
      <ThemedView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <AvatarCard email={cloudSession?.email ?? user?.email} />

          {cloudSession ? (
            <>
              <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText type="small" themeColor="textSecondary">
                  云端账本
                </ThemedText>
                <ThemedText type="default">{cloudSession.email}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {cloudSession.host}
                </ThemedText>
              </View>

              {/* 退出、换账号、断开全在云端备份页上，这里只给一条路过去。
                  同一件事在两个页面各放一个按钮，迟早会有一个忘了改 */}
              <Pressable
                onPress={() => router.push('/settings/cloud')}
                style={[styles.primaryButton, { backgroundColor: theme.cardHighlight }]}>
                <ThemedText type="default" style={{ color: theme.onCardHighlight }}>
                  管理云端账本
                </ThemedText>
              </Pressable>
            </>
          ) : user ? (
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
                <ThemedText type="default">还没有账号</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  记账、统计、导出文件都不需要账号。账号只为一件事：把账备份到云端，
                  换手机或重装时能拉回来。
                </ThemedText>
              </View>

              {/* 缺哪一步就指哪一步：连接串没填指向云端页，填了只差账号就直接去登录 */}
              <Pressable
                onPress={() => router.push(hasRemote ? '/login' : '/settings/cloud')}
                style={[styles.primaryButton, { backgroundColor: theme.cardHighlight }]}>
                <ThemedText type="default" style={{ color: theme.onCardHighlight }}>
                  {hasRemote ? '登录账本' : '连自己的数据库'}
                </ThemedText>
              </Pressable>

              {hasRemote ? (
                <Pressable
                  onPress={() => router.push('/register')}
                  style={[styles.logoutButton, { borderColor: theme.backgroundSelected }]}>
                  <ThemedText type="default">注册新账本</ThemedText>
                </Pressable>
              ) : null}
            </>
          )}
        </ScrollView>
      </ThemedView>
    </SafeAreaView>
  );
}

/**
 * 头像：一张图 + 换 / 删。
 *
 * 放在这一页最上面，**不管有没有账号都显示**——头像存在手机本地（见 db/avatar.ts），
 * 换它不需要登录。有云端账号时它会跟着备份推进 `User.avatar` 那一列，
 * 换手机恢复时拉回来，但那是附带的，不是前提。
 *
 * 删除那个按钮只在真有自定义图时出现：没图的时候「删除」是个点了什么都不会发生的按钮。
 */
function AvatarCard({ email }: { email: string | undefined }) {
  const theme = useTheme();
  const { data: avatarUri } = useAvatar();
  const pick = usePickAvatar();
  const clear = useClearAvatar();
  const [error, setError] = useState<string | null>(null);

  const initial = email ? email[0].toUpperCase() : '·';
  const busy = pick.isPending || clear.isPending;

  return (
    <View style={styles.avatarCard}>
      <Pressable
        onPress={() => {
          setError(null);
          pick.mutate(undefined, { onError: (err) => setError((err as Error).message) });
        }}
        disabled={busy}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={[styles.avatar, { backgroundColor: theme.cardHighlight }]}>
            <ThemedText type="pageTitle" style={{ color: theme.onCardHighlight }}>
              {initial}
            </ThemedText>
          </View>
        )}
      </Pressable>

      {busy ? <ActivityIndicator color={theme.cardHighlight} /> : null}

      <View style={styles.avatarActions}>
        <Pressable
          onPress={() => {
            setError(null);
            pick.mutate(undefined, { onError: (err) => setError((err as Error).message) });
          }}
          disabled={busy}>
          <ThemedText type="small" style={{ color: theme.cardHighlight }}>
            {avatarUri ? '换一张' : '上传头像'}
          </ThemedText>
        </Pressable>
        {avatarUri ? (
          <Pressable onPress={() => clear.mutate()} disabled={busy}>
            <ThemedText type="small" style={{ color: theme.expense }}>
              删除
            </ThemedText>
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <ThemedText type="small" style={{ color: theme.expense, textAlign: 'center' }}>
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: ScreenPadding, paddingVertical: Spacing.four, gap: Spacing.four },
  card: { padding: Spacing.three, borderRadius: 12, gap: Spacing.one },
  avatarCard: { alignItems: 'center', gap: Spacing.two },
  avatar: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  avatarActions: { flexDirection: 'row', gap: Spacing.four },
  primaryButton: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  logoutButton: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
