import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackupCard } from '@/components/settings/backup-card';
import { CloudBackupSheet } from '@/components/settings/cloud-backup-sheet';
import { RestoreSheet } from '@/components/settings/restore-sheet';
import { ExportSheet } from '@/components/settings/export-sheet';
import { FeatureGrid } from '@/components/settings/feature-grid';
import { ProfileHeader } from '@/components/settings/profile-header';
import { SettingsRow, SettingsSection } from '@/components/settings/settings-row';
import { PageHeader } from '@/components/ui/page-header';
import { DialogActions, ModalDialog } from '@/components/ui/modal-dialog';
import { ModalHost } from '@/components/ui/modal-host';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { ScreenBottomInset, ScreenGap, ScreenPadding } from '@/constants/theme';
import { getCloudTransport } from '@/api/cloud-transport';
import { parseBundle, type BackupBundle, type ImportSource, type PendingCounts } from '@/db/backup';
import { pickBackupFile } from '@/db/backup-file';
import { AutoSyncPeriodLabels } from '@/db/settings';
import { useAvatar } from '@/hooks/use-avatar';
import { useAutoSyncPeriod, useBackupState, useLocalStats } from '@/hooks/use-backup';
import { useCloudSession, useHasRemote } from '@/hooks/use-cloud';
import { useIdentity } from '@/hooks/use-identity';
import { useAuthStore } from '@/store/auth.store';

/**
 * 「我的」页。五段：**你是谁 → 去哪儿改设置 → 你的数据什么状况 → 数据的二级入口 → 其他**。
 *
 * 改版前这里是四个圆图标（账本 / 布局 / 主题 / 其他），一屏里九成是空的，
 * 而且圆图标**显示不了状态**——会让人真去点「备份」的是"还有 12 笔没备份"这句话，
 * 不是那个图标本身。
 *
 * 功能网格把「账本」和「外观」两个中转页整个拉平了，那两个页面（`settings/ledger.tsx`、
 * `settings/other.tsx`）已经删掉：它们各自只是转发三条和两条。
 *
 * 备份卡放在网格**下面**而不是上面：它紧挨着「数据」那一组，
 * 状态（三个数字）和它的两个二级入口连成一段，读起来是一件事。
 */
type RestoreSource = { label: string; load: () => Promise<BackupBundle>; source: ImportSource };

// 取数还没回来时给确认层一份全零：它自己会显示成「云端已经是最新的」并且禁用按钮，
// 比先闪一个错的数字好
const EMPTY_PENDING: PendingCounts = {
  transactions: 0,
  categories: 0,
  accounts: 0,
  transfers: 0,
  recurring: 0,
};

export default function SettingsScreen() {
  const user = useAuthStore((state) => state.user);
  const { data: stats } = useLocalStats();
  const { data: backupState } = useBackupState();
  const { data: autoSyncPeriod } = useAutoSyncPeriod();
  const { data: hasRemote } = useHasRemote();
  const { data: cloudSession } = useCloudSession();
  const identity = useIdentity();
  const { data: avatarUri } = useAvatar();

  // 「备份这条路通了」= 走我的后端登录了，或者自己的库**连上了并且登进了某一本账**。
  // 光把库连上不算：不知道该往哪本账里写（见 db/neon/client.ts 的 requireBookId）。
  // 这一页只关心"通不通"，走的是哪一条是 api/cloud-transport.ts 的事
  const cloudReady = !!user || !!cloudSession;

  // 云端备份和导出文件是**两个入口**，不是一个弹层里的两步：
  // 每次备份都先答一道"去云端还是导成文件"的选择题太烦，而那道题的答案几乎永远是云端
  const [sheet, setSheet] = useState<'backup' | 'export' | 'connect-first' | null>(null);

  // 恢复层两个来源共用一个组件，区别只有"怎么拿到 bundle"，所以状态里直接存那个取数函数
  const [restoreSource, setRestoreSource] = useState<RestoreSource | null>(null);

  /**
   * 顶部那条和「账号」那一行的去处。
   *
   * 连接串还没填的时候**先弹一句再走**，不直接把人推进账号页：那一页在这种状态下
   * 只会说一句「还没有账号」再给一个跳去别处的按钮，等于用一整屏说一句话。
   * 弹窗把这句话原地说完，还留了一个「取消」——点头像的人未必是来配置云端的。
   */
  const openAccount = () => {
    if (hasRemote) router.push('/settings/account');
    else setSheet('connect-first');
  };

  /**
   * 「从文件恢复」**先弹系统选择器，选完了才开恢复层**。
   *
   * 反过来（先开界面、再在它上面弹选择器）的话，点一下会连着出现两层，
   * 用户得穿过一个还是空的恢复页才回到正题。取消选择就什么都不发生——那是正常操作，不是错误。
   */
  const handleFileRestore = async () => {
    try {
      const picked = await pickBackupFile();
      if (!picked) return;
      setRestoreSource({ label: picked.name, load: () => parseBundle(picked.text), source: 'file' });
    } catch (error) {
      // 选择器自己出问题（极少）：把这条错误交给恢复层去显示，不在这一页另做一套错误 UI
      const message = (error as Error).message;
      setRestoreSource({ label: '文件', load: () => Promise.reject(new Error(message)), source: 'file' });
    }
  };

  // 「上次备份」取两条通道里**更近**的那一次：用户问的是"我的账上次出门是什么时候"，
  // 不关心它是去了云端还是变成一个文件
  const lastBackupAt = [backupState?.lastCloudBackupAt, backupState?.lastFileBackupAt]
    .filter((value): value is string => !!value)
    .sort()
    .at(-1) ?? null;

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

          <BackupCard
            transactions={stats?.transactions ?? 0}
            unsynced={stats?.unsyncedTotal ?? 0}
            lastBackupAt={lastBackupAt}
            cloudReady={cloudReady}
            // 连接串都没填就先去填；填了只差账号，直接送去登录页——
            // 再让他在云端页上找一次入口是多绕一步
            onConnect={() => router.push(hasRemote ? '/login' : '/settings/cloud')}
            connectLabel={hasRemote ? '登录后可备份' : '连接云端后可备份'}
            onBackup={() => setSheet('backup')}
            onRestore={() =>
              setRestoreSource({
                label: '云端',
                load: async () => (await getCloudTransport()).fetchCloudBundle(),
                source: 'cloud',
              })
            }
          />

          <SettingsSection label="数据">
            {/* 「云端备份」那一行挪进上面的功能网格了。这一组因此只剩"账怎么出门"这一件事：
                自动去、导出成文件、从文件回来。连去哪儿是上面那张卡和网格的事 */}
            <SettingsRow
              icon="cloud-outline"
              label="自动同步"
              hint={cloudReady ? '打开 App 时检查，只上传、不下载' : hasRemote ? '先登录一本账才能用' : '先连上云端才能用'}
              value={cloudReady ? AutoSyncPeriodLabels[autoSyncPeriod ?? 'off'] : undefined}
              // 云端还没通就送去缺的那一步：进到一个按了也不会生效的开关面前更让人困惑
              href={cloudReady ? '/settings/auto-sync' : hasRemote ? '/login' : '/settings/cloud'}
            />
            {/* 导出成文件从「备份」里拆出来单独站一行。恢复不在这里再开一个门——
                它就是卡上那个「恢复」，同一个页面开两扇门会被当成两个功能 */}
            <SettingsRow
              icon="download-outline"
              label="导出成文件"
              hint="完整备份 .json，或给 Excel 看的 .csv"
              onPress={() => setSheet('export')}
            />
            {/* 文件进、文件出并排站：卡上那两个按钮都只管云端，
                跟文件打交道的两件事在这里成对出现 */}
            <SettingsRow
              icon="folder-open-outline"
              label="从文件恢复"
              hint="读之前导出的 .json 备份"
              onPress={handleFileRestore}
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

      {/* 卡上那两个按钮用**同一种交互**：都是底部弹层，形状也一样——
          读一下、把将要发生的事逐条列出来、按一个确认。
          文件那两条在「数据」组里：导出是弹层，从文件恢复是路由（要弹系统文件选择器） */}
      {sheet === 'backup' ? (
        <CloudBackupSheet
          pending={stats?.pending ?? EMPTY_PENDING}
          builtins={stats?.pendingBuiltins ?? 0}
          onDismiss={() => setSheet(null)}
        />
      ) : null}
      {restoreSource ? (
        <RestoreSheet
          sourceLabel={restoreSource.label}
          load={restoreSource.load}
          source={restoreSource.source}
          onDismiss={() => setRestoreSource(null)}
        />
      ) : null}
      {sheet === 'export' ? <ExportSheet onDismiss={() => setSheet(null)} /> : null}

      {/* 用自家的对话框而不是 Alert.alert：Alert 是系统画的，不认这个 App 的主题色、
          圆角和字体，深色模式下尤其显眼。这一层跟备份、恢复、恢复提示用的是同一套壳 */}
      {sheet === 'connect-first' ? (
        <ModalHost visible onRequestClose={() => setSheet(null)}>
          <ModalDialog title="先连一个数据库" onDismiss={() => setSheet(null)}>
            <ThemedText type="small" themeColor="textSecondary">
              账号是建在你自己的 Neon 库里的，所以得先把库连上。
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              记账、统计、导出文件都不需要这一步，现在就能用。
            </ThemedText>
            <DialogActions
              confirmLabel="去连接"
              onCancel={() => setSheet(null)}
              onConfirm={() => {
                setSheet(null);
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
