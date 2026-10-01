import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FeatureGrid } from '@/components/settings/feature-grid';
import { ProfileHeader } from '@/components/settings/profile-header';
import { SettingsRow, SettingsSection } from '@/components/settings/settings-row';
import { PageHeader } from '@/components/ui/page-header';
import { DialogActions, ModalDialog } from '@/components/ui/modal-dialog';
import { ModalHost } from '@/components/ui/modal-host';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { ScreenBottomInset, ScreenGap, ScreenPadding } from '@/constants/theme';
import { useAvatar } from '@/hooks/use-avatar';
import { useLocalStats } from '@/hooks/use-backup';
import { useHasRemote } from '@/hooks/use-cloud';
import { useIdentity } from '@/hooks/use-identity';

/**
 * 「我的」页。四段：**你是谁 → 去哪儿改设置 → 数据怎么出门 → 其他**。
 *
 * 改版前这里是四个圆图标（账本 / 布局 / 主题 / 其他），一屏里九成是空的，
 * 而且圆图标**显示不了状态**——会让人真去点「备份」的是"还有 12 笔没备份"这句话，
 * 不是那个图标本身。
 *
 * 功能网格把「账本」和「外观」两个中转页整个拉平了，那两个页面（`settings/ledger.tsx`、
 * `settings/other.tsx`）已经删掉：它们各自只是转发三条和两条。
 *
 * **备份卡也没了，收成一行。** 原来这一页上备份是一张卡（两个按钮 + 三个数字），
 * 导出和从文件恢复是「数据」组里的两行，自动同步又是第三行——同一件事（我的账怎么出门）
 * 被劈成卡片和列表两种形状。那张卡底下那句"要用文件，看下面「数据」里的导出和恢复"
 * 就是这件事没理顺的证据：一个界面得用一句话告诉用户另一半功能在哪儿。
 * 现在它们都在 `settings/backup.tsx` 里，这一页只留一个入口。
 *
 * **但「未备份 N 条」必须留在这一行上。** 自动同步默认关着、开了也可能失败，
 * 那个数字是用户唯一的安全绳——它正是备份卡当初不许被折叠、不许挪进二级页的理由。
 * 收进二级页的是**操作**，不是**状态**：状态跟着入口行一起留在外面。
 */
export default function SettingsScreen() {
  const { data: stats } = useLocalStats();
  const { data: hasRemote } = useHasRemote();
  const identity = useIdentity();
  const { data: avatarUri } = useAvatar();

  const [showConnectFirst, setShowConnectFirst] = useState(false);

  const unsynced = stats?.unsyncedTotal ?? 0;

  /**
   * 顶部那条和「账号」那一行的去处。
   *
   * 连接串还没填的时候**先弹一句再走**，不直接把人推进账号页：那一页在这种状态下
   * 只会说一句「还没有账号」再给一个跳去别处的按钮，等于用一整屏说一句话。
   * 弹窗把这句话原地说完，还留了一个「取消」——点头像的人未必是来配置云端的。
   */
  const openAccount = () => {
    if (hasRemote) router.push('/settings/account');
    else setShowConnectFirst(true);
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
      <ThemedView style={styles.screen}>
        <PageHeader title="我的" />

        <ScrollView contentContainerStyle={styles.content}>
          <ProfileHeader
            email={identity?.email}
            onPress={openAccount}
            avatarUri={avatarUri ?? null}
            firstTransactionDate={stats?.firstTransactionDate ?? null}
          />

          <FeatureGrid />

          <SettingsSection label="数据">
            {/* 右边那个值就是原来备份卡上的药丸。它不用点进去就能看见，
                这是把备份收进二级页的前提——见组件顶上那段 */}
            <SettingsRow
              icon="cloud-upload-outline"
              label="数据备份与恢复"
              hint="备份到云端、导出成文件、从备份恢复"
              value={unsynced > 0 ? `${unsynced} 条未备份` : '全部已备份'}
              href="/settings/backup"
            />
          </SettingsSection>

          <SettingsSection label="其他">
            {/* 「货币汇率」也进网格了——它跟主题、首页布局是同一类东西（记账本身的设定），
                那三个既然都在网格里，它单独留一行只会让人以为它是另一种东西 */}
            <SettingsRow
              icon="person-outline"
              label="账号"
              hint={identity?.email ?? '还没有账号 · 记账不需要，备份到云端才需要'}
              onPress={openAccount}
            />
            <SettingsRow icon="information-circle-outline" label="关于" href="/settings/about" />
          </SettingsSection>
        </ScrollView>
      </ThemedView>

      {/* 用自家的对话框而不是 Alert.alert：Alert 是系统画的，不认这个 App 的主题色、
          圆角和字体，深色模式下尤其显眼。这一层跟备份、恢复、恢复提示用的是同一套壳 */}
      {showConnectFirst ? (
        <ModalHost visible onRequestClose={() => setShowConnectFirst(false)}>
          <ModalDialog title="先连一个数据库" onDismiss={() => setShowConnectFirst(false)}>
            <ThemedText type="small" themeColor="textSecondary">
              账号是建在你自己的 Neon 库里的，所以得先把库连上。
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              记账、统计、导出文件都不需要这一步，现在就能用。
            </ThemedText>
            <DialogActions
              confirmLabel="去连接"
              onCancel={() => setShowConnectFirst(false)}
              onConfirm={() => {
                setShowConnectFirst(false);
                router.push('/settings/cloud');
              }}
            />
          </ModalDialog>
        </ModalHost>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  // 四个 tab 页共用同一组数：横向 ScreenPadding、纵向 ScreenGap、底部 ScreenBottomInset。
  // 这一页原来 gap 是 16、底部靠一个空 View 撑，切 tab 时节奏会变一下
  content: {
    paddingHorizontal: ScreenPadding,
    paddingTop: ScreenGap,
    paddingBottom: ScreenBottomInset,
    gap: ScreenGap,
  },
});
