import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getCloudTransport } from '@/api/cloud-transport';
import { CloudBackupSheet, describePush } from '@/components/settings/cloud-backup-sheet';
import { ExportSheet } from '@/components/settings/export-sheet';
import { RestoreSheet } from '@/components/settings/restore-sheet';
import { SettingsRow, SettingsSection } from '@/components/settings/settings-row';
import { ModalHost } from '@/components/ui/modal-host';
import { TaskDialog } from '@/components/ui/task-dialog';
import { ThemedText } from '@/components/ui/themed-text';
import { Toast, useToast } from '@/components/ui/toast';
import { ThemedView } from '@/components/ui/themed-view';
import { ScreenBottomInset, ScreenGap, ScreenPadding, Spacing } from '@/constants/theme';
import { parseBundle, type BackupBundle, type ImportSource, type PendingCounts } from '@/db/backup';
import { pickBackupFile } from '@/db/backup-file';
import { AutoSyncPeriodLabels } from '@/db/settings';
import { describeError, type PushResult } from '@/db/sync';
import {
  useAutoSyncPeriod,
  useBackupState,
  useLocalStats,
  usePendingDeletions,
  usePushToCloud,
} from '@/hooks/use-backup';
import { useCloudSession, useHasRemote } from '@/hooks/use-cloud';
import { useTask } from '@/hooks/use-task';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/store/auth.store';

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

/**
 * 「数据备份与恢复」。原来这些东西散在「我的」页上：一张备份卡（两个按钮 + 三个数字）
 * 加「数据」那一组的三行（自动同步 / 导出成文件 / 从文件恢复）。
 *
 * **为什么收进一页**：那五个入口回答的是同一个问题——"我的账怎么出门、怎么回来"——
 * 却被卡片和列表两种形状劈成了两块，而且卡上那句"要用文件，看下面「数据」里的导出和恢复"
 * 正是这件事没理顺的证据：一个界面得用一句话告诉用户另一半功能在哪儿。
 * 收进来之后「我的」页只剩一行，而这一页按**去哪儿**分成两段：云备份 / 文件备份。
 *
 * 云和文件**不是主次关系**，是两条独立的路。文件那条不需要账号、不需要数据库，
 * 没连云端的人照样整段可用——所以它有自己的小标题和自己的说明条，
 * 不再是云备份卡底下的一句补充。
 *
 * ## 备份一键，恢复两步
 *
 * 这两个按钮**不该对称**。备份是幂等的（客户端生成 UUID，服务端按 id 去重），
 * 点错了最多白跑一次请求；而且「未备份 N 条」在上一页的入口行上已经写着，
 * 再弹一层把同一个数拆成「账单 3 / 分类 1」没有新信息。所以直接跑。
 *
 * **唯一的例外是删除**：删掉的记录要从云端一起抹掉，那一步不可逆。
 * 有待删除项时仍然开 CloudBackupSheet——那一层存在的理由从头到尾就是这个
 * （逐条点名 + 一个能取消的勾），不是"备份前确认一下"。
 *
 * 恢复保留两步：它是这一页唯一会**改掉本地已有数据**的操作（同 id 的分类按包里的版本更新），
 * 而且用户按下去之前并不知道手里这份包有多旧、是哪台设备导的。那张预览是唯一的告知机会。
 */
export default function BackupSettingsScreen() {
  const theme = useTheme();
  const user = useAuthStore((state) => state.user);
  const { data: stats } = useLocalStats();
  const { data: backupState } = useBackupState();
  const { data: autoSyncPeriod } = useAutoSyncPeriod();
  const { data: hasRemote } = useHasRemote();
  const { data: cloudSession } = useCloudSession();
  const { data: deletions = [] } = usePendingDeletions();

  const pushToCloud = usePushToCloud();
  const task = useTask();
  const toast = useToast();

  const [sheet, setSheet] = useState<'backup' | 'export' | null>(null);
  const [restoreSource, setRestoreSource] = useState<RestoreSource | null>(null);

  // 「这条路通了」= 走我的后端登录了，或者自己的库连上了并且登进了某一本账。
  // 跟「我的」页同一个判断（见那边的注释）
  const cloudReady = !!user || !!cloudSession;
  const unsynced = stats?.unsyncedTotal ?? 0;
  const nothingToPush = unsynced === 0 && deletions.length === 0;

  /**
   * 点「备份到云端」。有待删除项才开确认层，否则直接跑——理由见组件顶上那段。
   *
   * `withDeletions: true` 在这条路上其实没得选：走到这儿说明一条待删除都没有。
   * 写死 true 而不是 false，是为了让"默认行为 = 让云端跟本地一致"这个口径跟确认层一致，
   * 以后真有第三条路进来时不会分叉。
   */
  const handleBackup = () => {
    // 没东西可传时**也让它可点**，点了给一句 toast。
    // 变灰的按钮回答不了"为什么点不动"——用户看到的是一个坏掉的按钮，
    // 而真正的原因（已经全传完了）恰恰是个好消息。一句会自己消失的提示刚好够说完它
    if (nothingToPush) {
      toast.show('云端已经是最新的');
      return;
    }
    if (deletions.length > 0) {
      setSheet('backup');
      return;
    }
    void task.run<PushResult>(
      {
        running: '正在备份到云端…',
        // 跟确认层共用 describePush：两条路跑完必须说同一句话，
        // 否则同一次备份走哪条路会给出不同的交代
        success: (result) => ({ message: '备份完成', detail: describePush(result) }),
        describeError,
      },
      () => pushToCloud.mutateAsync({ withDeletions: true }),
    );
  };

  const openCloudRestore = () =>
    setRestoreSource({
      label: '云端',
      load: async () => (await getCloudTransport()).fetchCloudBundle(),
      source: 'cloud',
    });

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

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['bottom', 'left', 'right']}>
      <ThemedView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <SettingsSection label="云备份">
            <Tip>
              打开自动同步后，每次启动 App 会看一眼上次备份过去多久了，够一个周期就把没备份的推上去。
              只上传、不下载。
            </Tip>

            <SettingsRow
              icon="time-outline"
              label="自动同步"
              hint={cloudReady ? '打开 App 时检查，只上传、不下载' : hasRemote ? '先登录一本账才能用' : '先连上云端才能用'}
              value={cloudReady ? AutoSyncPeriodLabels[autoSyncPeriod ?? 'off'] : undefined}
              // 云端还没通就送去缺的那一步：进到一个按了也不会生效的开关面前更让人困惑
              href={cloudReady ? '/settings/auto-sync' : hasRemote ? '/login' : '/settings/cloud'}
            />

            {cloudReady ? (
              <>
                {/* 有东西要传时标签带上那个数：这一页没有备份卡那三格统计了，
                    "有多少要传"得由按钮自己说，否则点之前看不出会发生什么。
                    传完之后只写「备份到云端」，**不写「云端已经是最新的」**——
                    那是一句状态，印在按钮上会让人以为按钮坏了。那句话交给点下去之后的 toast */}
                <ActionButton
                  icon="cloud-upload-outline"
                  label={unsynced > 0 ? `备份到云端 · ${unsynced} 条` : '备份到云端'}
                  onPress={handleBackup}
                  disabled={task.isRunning}
                  tone="primary"
                />
                <ActionButton
                  icon="cloud-download-outline"
                  label="从云端恢复"
                  onPress={openCloudRestore}
                  tone="restore"
                />

                <ThemedText type="small" themeColor="textSecondary" style={styles.footnote}>
                  上次备份：{backupState?.lastCloudBackupAt ? formatMoment(backupState.lastCloudBackupAt) : '从没'} ·
                  本地账单 {stats?.transactions ?? 0} 笔
                </ThemedText>
              </>
            ) : (
              // 连接串都没填就先去填；填了只差账号，直接送去登录页——
              // 再让他在云端页上找一次入口是多绕一步
              <ActionButton
                icon="cloud-outline"
                label={hasRemote ? '登录后可备份' : '连接云端后可备份'}
                onPress={() => router.push(hasRemote ? '/login' : '/settings/cloud')}
                tone="primary"
              />
            )}

            {/* 自动备份失败是后台行为，用户只在来这一页时才需要知道它前天没成。
                成功一次这条就会被擦掉（见 markCloudBackupDone） */}
            {backupState?.lastSyncError ? (
              <View style={[styles.alert, { backgroundColor: theme.backgroundElement }]}>
                <Ionicons name="warning-outline" size={20} color={theme.expense} />
                <View style={styles.alertText}>
                  <ThemedText type="default">
                    {formatMoment(backupState.lastSyncError.at)} 自动备份没成功
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {backupState.lastSyncError.message}·下次打开 App 会再试
                  </ThemedText>
                </View>
              </View>
            ) : null}
          </SettingsSection>

          <SettingsSection label="文件备份">
            {/* 这段的说明单独写一条，不是云备份那条的补充：文件这条路**不需要账号、不需要数据库**，
                没连云端的人整段可用。原来这句话挤在备份卡底下当脚注，读起来像"云端的备用方案" */}
            <Tip>
              导出一份备份文件自己收着，以后从它就能恢复。这条路不需要账号、也不需要连数据库，现在就能用。
            </Tip>
            <SettingsRow
              icon="download-outline"
              label="导出成文件"
              hint="完整备份 .json，或给 Excel 看的 .csv"
              onPress={() => setSheet('export')}
            />
            <SettingsRow
              icon="folder-open-outline"
              label="从文件恢复"
              hint="读之前导出的 .json 备份"
              onPress={handleFileRestore}
            />
          </SettingsSection>
        </ScrollView>
      </ThemedView>

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

      {/* 一键备份那条路自己的结果卡。确认层那条路的结果卡在 CloudBackupSheet 里面，
          两边用的是同一个 TaskDialog 和同一句 describePush。
          运行中不响应遮罩和返回键，免得跑到一半被关掉 */}
      {/* 放在所有弹层后面：它是浮在最上面的一句话，不该被刚关掉的弹层压住 */}
      <Toast toast={toast.toast} onHide={toast.clear} />

      {task.state ? (
        <ModalHost
          visible
          onRequestClose={() => (task.state?.status === 'running' ? undefined : task.dismiss())}>
          <TaskDialog state={task.state} onDismiss={task.dismiss} />
        </ModalHost>
      ) : null}
    </SafeAreaView>
  );
}

/**
 * 段首那条说明。底色是**主题强调色的淡色版**——黑金主题下就是参考界面上那种浅黄。
 *
 * 用 `cardHighlight + 透明度` 而不是写死一个琥珀色：三套主题的强调色分别是橙、金、紫，
 * 写死的话在黑紫主题上会多出一个跟全局无关的颜色。
 *
 * 透明度取 `26`（十六进制 38/255 ≈ 15%）。先试过 `14`（8%），在纯黑底上几乎看不出是块彩色，
 * 读起来跟旁边的卡片一样是灰的；15% 刚好让它成为一块"浅黄的提示"，又不会亮到跟
 * 下面那个实心强调色按钮抢。文字仍用 textSecondary——这块底色已经在表示"这是说明"，
 * 字再染一次色就有两个东西在说同一件事。
 */
function Tip({ children }: { children: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.tip, { backgroundColor: theme.cardHighlight + '26' }]}>
      <Ionicons name="bulb-outline" size={18} color={theme.cardHighlight} style={styles.tipIcon} />
      <ThemedText type="small" themeColor="textSecondary" style={styles.tipText}>
        {children}
      </ThemedText>
    </View>
  );
}

/**
 * 「从云端恢复」那个蓝。**不进色板**，就留在这一页。
 *
 * 它不是一种主题色——三套主题的强调色（橙/金/紫）表达的是"这个 App 长什么样"，
 * 而这个蓝表达的是"**往下拿**，跟上面那个往上送的是反方向"。跟 income/expense 那对红绿
 * 一个性质：语义色，三套主题共用一个值。
 *
 * 之所以不像红绿那样写进 `Colors`：那对红绿全 App 几十处在用，而这个蓝只有这一个按钮。
 * 为一处用法给三套主题各加一个 token，下次调色时就是三个地方要同步改。
 * 真有第二个"反方向"的按钮出现时再搬进色板。
 */
const RESTORE_BLUE = '#4A9EEB';

/**
 * 整幅宽的动作按钮。
 *
 * 三档：`primary` 用主题强调色（备份）、`restore` 用上面那个蓝（恢复）、`ghost` 描边。
 * 备份和恢复**用两个实心色**而不是"一个实心一个描边"，是因为它们不是主次关系——
 * 一个往上送、一个往下拿，是一对方向相反的动作，谁也不该看起来像谁的附属。
 */
function ActionButton({
  icon,
  label,
  onPress,
  disabled,
  tone = 'ghost',
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'primary' | 'restore' | 'ghost';
}) {
  const theme = useTheme();

  // 蓝底一律配白字：它是写死的颜色，不跟着主题走，所以 onCardHighlight（黑金主题下是深色）
  // 在它上面是错的搭配
  const surface =
    tone === 'primary'
      ? { backgroundColor: theme.cardHighlight }
      : tone === 'restore'
        ? { backgroundColor: RESTORE_BLUE }
        : { backgroundColor: theme.backgroundElement, borderWidth: 1, borderColor: theme.backgroundSelected };
  const foreground =
    tone === 'primary' ? theme.onCardHighlight : tone === 'restore' ? '#ffffff' : theme.text;

  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.action, surface, disabled && styles.dimmed]}>
      <Ionicons name={icon} size={20} color={foreground} />
      <ThemedText type="default" style={{ color: foreground }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function formatMoment(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    paddingHorizontal: ScreenPadding,
    paddingTop: ScreenGap,
    paddingBottom: ScreenBottomInset,
    gap: ScreenGap,
  },
  tip: {
    flexDirection: 'row',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: 12,
  },
  // 图标顶对齐：说明通常两三行，居中会让它吊在中间看起来跟文字没关系
  tipIcon: { marginTop: 1 },
  tipText: { flex: 1, lineHeight: 19 },
  action: {
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  dimmed: { opacity: 0.45 },
  // 居中：它交代的是上面那两个按钮刚做过的事，不是列表里的一行。
  // 左对齐会跟底下「文件备份」那组的行首排成一列，读起来像又一个条目
  footnote: { textAlign: 'center', paddingHorizontal: Spacing.half },
  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: 12,
  },
  alertText: { flex: 1, gap: 2 },
});
