import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackupCard } from '@/components/settings/backup-card';
import { CloudBackupSheet } from '@/components/settings/cloud-backup-sheet';
import { RestoreSheet } from '@/components/settings/restore-sheet';
import { ExportSheet } from '@/components/settings/export-sheet';
import { FeatureGrid } from '@/components/settings/feature-grid';
import { ProfileHeader } from '@/components/settings/profile-header';
import { SettingsRow, SettingsSection } from '@/components/settings/settings-row';
import { PageHeader } from '@/components/ui/page-header';
import { ThemedView } from '@/components/ui/themed-view';
import { ScreenPadding, Spacing } from '@/constants/theme';
import { fetchCloudBundle } from '@/api/sync';
import { parseBundle, type BackupBundle } from '@/db/backup';
import { pickBackupFile } from '@/db/backup-file';
import { AutoSyncPeriodLabels } from '@/db/settings';
import { useAutoSyncPeriod, useBackupState, useLocalStats } from '@/hooks/use-backup';
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
type RestoreSource = { label: string; load: () => Promise<BackupBundle> };

export default function SettingsScreen() {
  const user = useAuthStore((state) => state.user);
  const { data: stats } = useLocalStats();
  const { data: backupState } = useBackupState();
  const { data: autoSyncPeriod } = useAutoSyncPeriod();

  // 云端备份和导出文件是**两个入口**，不是一个弹层里的两步：
  // 每次备份都先答一道"去云端还是导成文件"的选择题太烦，而那道题的答案几乎永远是云端
  const [sheet, setSheet] = useState<'backup' | 'export' | null>(null);

  // 恢复层两个来源共用一个组件，区别只有"怎么拿到 bundle"，所以状态里直接存那个取数函数
  const [restoreSource, setRestoreSource] = useState<RestoreSource | null>(null);

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
      setRestoreSource({ label: picked.name, load: () => parseBundle(picked.text) });
    } catch (error) {
      // 选择器自己出问题（极少）：把这条错误交给恢复层去显示，不在这一页另做一套错误 UI
      const message = (error as Error).message;
      setRestoreSource({ label: '文件', load: () => Promise.reject(new Error(message)) });
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
        <ScrollView contentContainerStyle={styles.content}>
          <PageHeader title="我的" />

          <ProfileHeader
            email={user?.email}
            transactionCount={stats?.transactions ?? 0}
            firstTransactionDate={stats?.firstTransactionDate ?? null}
          />

          <FeatureGrid />

          <BackupCard
            transactions={stats?.transactions ?? 0}
            unsynced={stats?.unsynced ?? 0}
            lastBackupAt={lastBackupAt}
            onBackup={() => setSheet('backup')}
            onRestore={() => setRestoreSource({ label: '云端', load: fetchCloudBundle })}
          />

          <SettingsSection label="数据">
            <SettingsRow
              icon="cloud-outline"
              label="自动同步"
              hint="打开 App 时检查，只上传、不下载"
              value={AutoSyncPeriodLabels[autoSyncPeriod ?? 'off']}
              href="/settings/auto-sync"
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
            <SettingsRow
              icon="person-outline"
              label="账号"
              hint={user?.email}
              href="/settings/account"
            />
            <SettingsRow icon="information-circle-outline" label="关于" href="/settings/about" />
          </SettingsSection>

          <View style={styles.tail} />
        </ScrollView>
      </ThemedView>

      {/* 卡上那两个按钮用**同一种交互**：都是底部弹层，形状也一样——
          读一下、把将要发生的事逐条列出来、按一个确认。
          文件那两条在「数据」组里：导出是弹层，从文件恢复是路由（要弹系统文件选择器） */}
      {sheet === 'backup' ? (
        <CloudBackupSheet unsynced={stats?.unsyncedTotal ?? 0} onDismiss={() => setSheet(null)} />
      ) : null}
      {restoreSource ? (
        <RestoreSheet
          sourceLabel={restoreSource.label}
          load={restoreSource.load}
          onDismiss={() => setRestoreSource(null)}
        />
      ) : null}
      {sheet === 'export' ? <ExportSheet onDismiss={() => setSheet(null)} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  // paddingTop 跟其余三个 tab 页取同一个数，标题条才不会在切 tab 时上下跳
  content: { paddingHorizontal: ScreenPadding, paddingTop: 12, gap: Spacing.three },
  // 底部 tab bar 是浮在内容上面的，最后一组卡片要留出它的高度才不会被压住
  tail: { height: Spacing.six },
});
