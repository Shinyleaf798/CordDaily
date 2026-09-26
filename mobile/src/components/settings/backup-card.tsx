import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type BackupCardProps = {
  transactions: number;
  unsynced: number;
  lastBackupAt: string | null;
  onBackup: () => void;
  onRestore: () => void;
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
export function BackupCard({ transactions, unsynced, lastBackupAt, onBackup, onRestore }: BackupCardProps) {
  const theme = useTheme();
  const hasPending = unsynced > 0;

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.header}>
        <ThemedText type="default">备份</ThemedText>
        <View style={[styles.pill, { borderColor: hasPending ? theme.cardHighlight : theme.backgroundSelected }]}>
          <ThemedText type="small" style={{ color: hasPending ? theme.cardHighlight : theme.textSecondary }}>
            {hasPending ? `${unsynced} 笔未备份` : '全部已备份'}
          </ThemedText>
        </View>
      </View>

      <View style={styles.stats}>
        <Stat label="本地账单" value={String(transactions)} />
        <Stat label="未备份" value={String(unsynced)} />
        <Stat label="上次备份" value={lastBackupAt ? formatDay(lastBackupAt) : '从没'} />
      </View>

      <View style={styles.buttons}>
        <Pressable onPress={onBackup} style={[styles.button, { backgroundColor: theme.cardHighlight }]}>
          <Ionicons name="arrow-up-circle-outline" size={18} color={theme.onCardHighlight} />
          <ThemedText type="default" style={{ color: theme.onCardHighlight }}>
            备份
          </ThemedText>
        </Pressable>
        <Pressable onPress={onRestore} style={[styles.button, styles.ghost, { borderColor: theme.backgroundSelected }]}>
          <Ionicons name="arrow-down-circle-outline" size={18} color={theme.text} />
          <ThemedText type="default">恢复</ThemedText>
        </Pressable>
      </View>

      <ThemedText type="small" themeColor="textSecondary">
        备份自带分类和账户，恢复后不会多出重复分类。
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
