import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackupCard } from '@/components/settings/backup-card';
import { BackupSheet } from '@/components/settings/backup-sheet';
import { FeatureGrid } from '@/components/settings/feature-grid';
import { ProfileHeader } from '@/components/settings/profile-header';
import { SettingsRow, SettingsSection } from '@/components/settings/settings-row';
import { PageHeader } from '@/components/ui/page-header';
import { ThemedView } from '@/components/ui/themed-view';
import { ScreenPadding, Spacing } from '@/constants/theme';
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
export default function SettingsScreen() {
  const user = useAuthStore((state) => state.user);
  const { data: stats } = useLocalStats();
  const { data: backupState } = useBackupState();
  const { data: autoSyncPeriod } = useAutoSyncPeriod();

  // 备份弹层从两个地方打开：卡上的「备份」按钮（从选目的地那步开始），
  // 和「账单导入导出」那一行（直接落到文件那步——那一行说的就是文件）
  const [backupStep, setBackupStep] = useState<'destination' | 'file' | null>(null);

  // 云端还没接通（后端要先补收 id 的接口和 /sync/bundle），所以「上次备份」现在只有文件那条
  const lastBackupAt = backupState?.lastCloudBackupAt ?? backupState?.lastFileBackupAt ?? null;

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
            onBackup={() => setBackupStep('destination')}
            onRestore={() => router.push('/settings/restore')}
          />

          <SettingsSection label="数据">
            <SettingsRow
              icon="cloud-outline"
              label="自动同步"
              hint="打开 App 时检查，只上传、不下载"
              value={AutoSyncPeriodLabels[autoSyncPeriod ?? 'off']}
              href="/settings/auto-sync"
            />
            <SettingsRow
              icon="swap-horizontal-outline"
              label="账单导入导出"
              hint="CSV 给 Excel 看，或从备份文件恢复"
              onPress={() => setBackupStep('file')}
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

      {backupStep ? (
        <BackupSheet
          initialStep={backupStep}
          transactions={stats?.transactions ?? 0}
          unsynced={stats?.unsynced ?? 0}
          onDismiss={() => setBackupStep(null)}
        />
      ) : null}
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
