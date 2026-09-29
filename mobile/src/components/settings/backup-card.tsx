import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type BackupCardProps = {
  transactions: number;
  /** 待备份的条数。跟备份确认层里那份清单是**同一个口径**（`LocalStats.unsyncedTotal`）：
   *  这里说"全部已备份"、点进去却列出一堆要上传的，比数字大一点更让人不信任 */
  unsynced: number;
  lastBackupAt: string | null;
  /**
   * 云端那条通道通不通。**两种情况都算通**：登录了自己那台服务器，
   * 或者填了自己的 Neon 连接串（见 app/settings/cloud.tsx）。
   *
   * 这里刻意不区分是哪一种——这张卡要回答的是"我的账能不能出门"，
   * 而"它出门去了谁的库"是设置页的事。不通的时候只剩三个数字和一个「去连接」。
   */
  cloudReady: boolean;
  onBackup: () => void;
  onRestore: () => void;
  /** 云端还没通时那个按钮。差哪一步就带去哪一页——差连接串去云端页，差账号去登录页 */
  onConnect: () => void;
  /**
   * 那个按钮上的字。默认说的是"去连库"，但云端没通有**两种差法**
   * （连接串没填 / 填了但还没进一本账），按钮说错一种，用户就会被送到一个
   * 他已经做完了的步骤面前。
   */
  connectLabel?: string;
};

/**
 * 「我的」页那张备份卡。三个数字回答同一个问题的三个面：
 * 我有多少账（1,284）、多少还没出去（12）、上次出去是什么时候（09-24）。
 *
 * 「未备份」在药丸和中间那格各出现一次，不是重复：药丸是扫一眼的警示色，
 * 格子是它在三个数里的位置——`12 / 1,284` 才有比例感，这也正是「本地账单」那个数存在的理由。
 *
 * 这张卡**不能折叠、不能挪到二级页**：自动同步默认关着、开了也可能失败，
 * 「还有 12 笔没备份」是用户唯一的安全绳。
 */
export function BackupCard({
  transactions,
  unsynced,
  lastBackupAt,
  cloudReady,
  onBackup,
  onRestore,
  onConnect,
  connectLabel = '连接云端后可备份',
}: BackupCardProps) {
  const theme = useTheme();
  const hasPending = unsynced > 0;

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.header}>
        <ThemedText type="default">备份</ThemedText>
        <View style={[styles.pill, { borderColor: hasPending ? theme.cardHighlight : theme.backgroundSelected }]}>
          <ThemedText type="small" style={{ color: hasPending ? theme.cardHighlight : theme.textSecondary }}>
            {hasPending ? `${unsynced} 条未备份` : '全部已备份'}
          </ThemedText>
        </View>
      </View>

      <View style={styles.stats}>
        <Stat label="本地账单" value={String(transactions)} />
        <Stat label="未备份" value={String(unsynced)} />
        <Stat label="上次备份" value={lastBackupAt ? formatDay(lastBackupAt) : '从没'} />
      </View>

      {cloudReady ? (
        <View style={styles.buttons}>
          <Pressable onPress={onBackup} style={[styles.button, { backgroundColor: theme.cardHighlight }]}>
            <Ionicons name="arrow-up-circle-outline" size={18} color={theme.onCardHighlight} />
            <ThemedText type="default" style={{ color: theme.onCardHighlight }}>
              备份到云端
            </ThemedText>
          </Pressable>
          <Pressable onPress={onRestore} style={[styles.button, styles.ghost, { borderColor: theme.backgroundSelected }]}>
            <Ionicons name="arrow-down-circle-outline" size={18} color={theme.text} />
            <ThemedText type="default">恢复</ThemedText>
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={onConnect} style={[styles.button, { backgroundColor: theme.cardHighlight }]}>
          <Ionicons name="cloud-outline" size={18} color={theme.onCardHighlight} />
          <ThemedText type="default" style={{ color: theme.onCardHighlight }}>
            {connectLabel}
          </ThemedText>
        </Pressable>
      )}

      {/* 说清楚这两个按钮的去处都是云端，以及文件那条在哪儿——
          不写的话用户会在这张卡上找"导入文件"，找不到就以为功能没做。
          没连云端时更要说：文件那条**不需要任何账号或数据库**，现在就能用 */}
      <ThemedText type="small" themeColor="textSecondary">
        {cloudReady
          ? '这两个按钮都走云端。要用文件，看下面「数据」里的导出和恢复。'
          : '不连云端也能记账。下面「数据」里的导出成文件和从文件恢复，现在就能用。'}
      </ThemedText>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: theme.background }]}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="default">{value}</ThemedText>
    </View>
  );
}

function formatDay(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three, borderRadius: 14, gap: Spacing.three },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 1 },
  stats: { flexDirection: 'row', gap: Spacing.two },
  stat: { flex: 1, borderRadius: 10, paddingHorizontal: Spacing.two, paddingVertical: Spacing.two, gap: 2 },
  buttons: { flexDirection: 'row', gap: Spacing.two },
  button: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one + 2,
  },
  ghost: { borderWidth: 1 },
});
