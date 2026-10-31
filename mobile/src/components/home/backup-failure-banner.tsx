import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { useBackupState } from '@/hooks/use-backup';
import { useTheme } from '@/hooks/use-theme';

/** 连续失败几次才在首页出声。偶尔一次没网不值得打扰人，一直失败才需要 */
const FAILURE_THRESHOLD = 3;

/**
 * 首页顶上的「自动备份一直没成功」横幅。
 *
 * 平时失败只记在「我的」页备份卡和自动同步页上——用户不去那两页就不知道，
 * 于是会以为自己的账一直在云端，其实好几天没上去了。连续失败满 3 次才在首页露面。
 *
 * **不是系统通知**：那要多装一个原生通知库、再问用户要通知权限，而失败的常见原因（没网、服务器在睡）
 * 恰好是打开 App 时最容易自己好的，推到通知栏只会变成噪音。
 *
 * 点 × 只是这次先收起：记下收起时是第几次失败，再失败一次（次数变了）又会出来。
 * 存在内存里不落库——下次打开 App 还是失败的话，本来就该再说一遍。
 * 成功一次失败记录整条清掉，横幅自然消失
 */
export function BackupFailureBanner() {
  const theme = useTheme();
  const { data: backupState } = useBackupState();
  const [dismissedAtCount, setDismissedAtCount] = useState(0);

  const failure = backupState?.lastSyncError;
  if (!failure || failure.count < FAILURE_THRESHOLD || failure.count <= dismissedAtCount) return null;

  return (
    <Pressable
      onPress={() => router.push('/settings/auto-sync')}
      style={[styles.banner, { backgroundColor: theme.backgroundElement, borderColor: theme.expense }]}>
      <Ionicons name="cloud-offline-outline" size={20} color={theme.expense} />
      <View style={styles.text}>
        <ThemedText type="smallBold">自动备份已经连续 {failure.count} 次没成功</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
          {failure.message}。账都还在手机上，点这里看看
        </ThemedText>
      </View>
      <Pressable
        onPress={() => setDismissedAtCount(failure.count)}
        hitSlop={10}
        accessibilityLabel="先收起"
        style={styles.close}>
        <Ionicons name="close" size={18} color={theme.textSecondary} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  close: {
    padding: 2,
  },
});
