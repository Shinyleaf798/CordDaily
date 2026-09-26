import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { ScreenPadding, Spacing } from '@/constants/theme';
import { AutoSyncPeriodLabels, type AutoSyncPeriod } from '@/db/settings';
import { describeError } from '@/db/sync';
import {
  useAutoSyncPeriod,
  useBackupState,
  useLocalStats,
  usePushToCloud,
  useSetAutoSyncPeriod,
} from '@/hooks/use-backup';
import { useTheme } from '@/hooks/use-theme';

const PERIODS: Exclude<AutoSyncPeriod, 'off'>[] = ['daily', 'weekly', 'monthly'];

/**
 * 自动同步设置。
 *
 * **开关和周期分两层**，而不是把「关」塞进周期列表里当第四个选项：
 * "要不要自动"和"多久一次"是两个问题。关掉时下面那三个选项整块压暗，
 * 它们还在那儿——用户能看见自己上次选的是每 7 天，再打开时不用重选。
 *
 * 默认是**关**（CLAUDE.md 原则#1）：账先只在这台手机上，送出去是用户自己的决定。
 *
 * 底下那个「立即备份」跟自动走的**是同一个函数**（`pushUnsynced`），只是绕过了周期判断。
 * 失败就地显示一行，不推系统通知：自动同步是后台行为，用户只在来这一页时才需要知道它前天没成。
 */
export default function AutoSyncSettingsScreen() {
  const theme = useTheme();
  const { data: period = 'off' } = useAutoSyncPeriod();
  const { data: stats } = useLocalStats();
  const { data: backupState } = useBackupState();
  const setPeriod = useSetAutoSyncPeriod();
  const pushToCloud = usePushToCloud();
  const [error, setError] = useState<string | null>(null);

  const isOn = period !== 'off';
  const unsynced = stats?.unsynced ?? 0;

  const handlePushNow = () => {
    setError(null);
    pushToCloud.mutate(undefined, { onError: (pushError) => setError(describeError(pushError)) });
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['bottom', 'left', 'right']}>
      <ThemedView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
            <Ionicons name="cloud-upload-outline" size={20} color={theme.cardHighlight} />
            <View style={styles.rowText}>
              <ThemedText type="default">自动备份到云端</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                打开 App 时检查，只上传、不下载
              </ThemedText>
            </View>
            {/* 关掉时记住上次的周期做不到——设置里只存一个值。所以从关到开默认回到「每 7 天」，
                那是三个里最不容易让人后悔的一档 */}
            <Switch
              value={isOn}
              onValueChange={(next) => setPeriod.mutate(next ? 'weekly' : 'off')}
              trackColor={{ false: theme.backgroundSelected, true: theme.cardHighlight }}
              thumbColor={theme.backgroundElement}
            />
          </View>

          <View style={[styles.group, !isOn && styles.dimmed]} pointerEvents={isOn ? 'auto' : 'none'}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.groupLabel}>
              多久一次
            </ThemedText>
            {PERIODS.map((option) => (
              <Pressable
                key={option}
                onPress={() => setPeriod.mutate(option)}
                style={[
                  styles.row,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: period === option ? theme.cardHighlight : 'transparent',
                  },
                  styles.selectable,
                ]}>
                <ThemedText type="default" style={styles.grow}>
                  {AutoSyncPeriodLabels[option]}
                </ThemedText>
                {period === option ? (
                  <Ionicons name="checkmark-circle" size={20} color={theme.cardHighlight} />
                ) : null}
              </Pressable>
            ))}
          </View>

          <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="small" themeColor="textSecondary">
              状态
            </ThemedText>
            <Line label="上次备份到云端" value={backupState?.lastCloudBackupAt ? formatMoment(backupState.lastCloudBackupAt) : '从没'} />
            <Line label="上次导出成文件" value={backupState?.lastFileBackupAt ? formatMoment(backupState.lastFileBackupAt) : '从没'} />
            <Line label="未备份" value={`${stats?.unsynced ?? 0} 笔`} />
            <Line label="这台手机的账单" value={`${stats?.transactions ?? 0} 笔`} />
          </View>

          {/* 失败就地显示，不推系统通知：自动同步是后台行为，用户只在来这一页时才需要知道它前天没成。
              成功一次这条就会被擦掉（见 markCloudBackupDone） */}
          {backupState?.lastSyncError ? (
            <View style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
              <Ionicons name="warning-outline" size={20} color={theme.expense} />
              <View style={styles.rowText}>
                <ThemedText type="default">{formatMoment(backupState.lastSyncError.at)} 自动备份没成功</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {backupState.lastSyncError.message}·下次打开 App 会再试
                </ThemedText>
              </View>
            </View>
          ) : null}

          {error ? (
            <ThemedText type="small" style={{ color: theme.expense }}>
              {error}
            </ThemedText>
          ) : null}

          {/* 「立即备份」不受上面那个开关影响：关掉自动同步不等于不想备份，
              只是不想让它自己跑 */}
          <Pressable
            onPress={handlePushNow}
            disabled={pushToCloud.isPending || unsynced === 0}
            style={[
              styles.primary,
              { backgroundColor: theme.cardHighlight },
              unsynced === 0 && styles.dimmed,
            ]}>
            {pushToCloud.isPending ? (
              <ActivityIndicator color={theme.onCardHighlight} />
            ) : (
              <ThemedText type="default" style={{ color: theme.onCardHighlight }}>
                {unsynced === 0 ? '没有需要上传的记录' : `立即备份 ${unsynced} 笔`}
              </ThemedText>
            )}
          </Pressable>

          <ThemedText type="small" themeColor="textSecondary">
            关掉之后账照样记，只是留在这台手机上，要上传就自己点一下。
          </ThemedText>
        </ScrollView>
      </ThemedView>
    </SafeAreaView>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.line}>
      <ThemedText type="default">{label}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {value}
      </ThemedText>
    </View>
  );
}

function formatMoment(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: ScreenPadding, paddingVertical: Spacing.four, gap: Spacing.three },
  grow: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: 12,
  },
  selectable: { borderWidth: 2 },
  rowText: { flex: 1, gap: 2 },
  group: { gap: Spacing.two },
  groupLabel: { paddingHorizontal: Spacing.half },
  dimmed: { opacity: 0.4 },
  card: { padding: Spacing.three, borderRadius: 12, gap: Spacing.one },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  primary: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
