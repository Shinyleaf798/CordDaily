import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatClockTime, formatDayLabel } from '@/utils/date';

type TransactionMetaRowProps = {
  date: Date;
  onDatePress: () => void;
  /** 没选到账户时传 null，按钮会用支出色提醒——这是保存前必须填的 */
  accountName: string | null;
  onAccountPress: () => void;
};

// 日期和账户两个按钮。它们跟"金额""分类"不一样：几乎每笔都用默认值（今天 + 上次用的账户），
// 所以只占一行，显示当前值，点开才展开选择器——不是每次记账都要过一遍的步骤，
// 不该像分类网格那样长期占着半屏。
export function TransactionMetaRow({ date, onDatePress, accountName, onAccountPress }: TransactionMetaRowProps) {
  const theme = useTheme();
  const missingAccount = !accountName;

  return (
    <View style={styles.row}>
      <Pressable onPress={onDatePress} style={[styles.chip, { backgroundColor: theme.background }]}>
        <Ionicons name="calendar-outline" size={16} color={theme.textSecondary} />
        {/* 连时分一起显示：不然在弹层里调完时间，回到这里看不出有没有生效 */}
        <ThemedText type="small" numberOfLines={1}>
          {formatDayLabel(date)} {formatClockTime(date)}
        </ThemedText>
      </Pressable>

      <Pressable onPress={onAccountPress} style={[styles.chip, { backgroundColor: theme.background }]}>
        <Ionicons name="wallet-outline" size={16} color={missingAccount ? theme.expense : theme.textSecondary} />
        <ThemedText type="small" numberOfLines={1} style={missingAccount ? { color: theme.expense } : undefined}>
          {accountName ?? '选择账户'}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    height: 36,
    borderRadius: 10,
    paddingHorizontal: Spacing.two,
  },
});
