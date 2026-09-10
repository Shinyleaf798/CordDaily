import { StyleSheet, View } from 'react-native';

import { CircularProgress } from '@/components/circular-progress';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type BudgetProgressCardProps = {
  budgetTotal: number;
  spent: number;
  daysInMonth: number;
  daysElapsed: number;
};

// 预算卡：环形进度 + 已消费/剩余额度 + 日均消费/剩余每日可消费（后两个数字在组件内部派生，调用方只给原始值）
// budgetTotal 是所有分类预算加总（见 DECISIONS.md），不是单独存的一个"总预算"字段
export function BudgetProgressCard({ budgetTotal, spent, daysInMonth, daysElapsed }: BudgetProgressCardProps) {
  const theme = useTheme();
  const remaining = budgetTotal - spent;
  const percentage = budgetTotal > 0 ? (spent / budgetTotal) * 100 : 0;
  const remainingDays = Math.max(daysInMonth - daysElapsed, 1);
  const dailyAverage = daysElapsed > 0 ? spent / daysElapsed : 0;
  const dailyRemaining = remaining / remainingDays;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.headerRow}>
        <ThemedText type="default">本月预算</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          RM{budgetTotal.toFixed(2)}
        </ThemedText>
      </View>

      <View style={styles.body}>
        <CircularProgress percentage={percentage} color={theme.income} trackColor={theme.backgroundSelected}>
          <ThemedText type="smallBold">{Math.round(percentage)}%</ThemedText>
        </CircularProgress>

        <View style={styles.stats}>
          <ThemedText type="default">RM{spent.toFixed(2)}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            已消费
          </ThemedText>
        </View>

        <View style={styles.stats}>
          <ThemedText type="default" style={{ color: theme.income }}>
            RM{remaining.toFixed(2)}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            剩余额度
          </ThemedText>
        </View>
      </View>

      <View style={[styles.footerRow, { borderTopColor: theme.backgroundSelected }]}>
        <View style={styles.footerItem}>
          <View style={styles.footerItemLeft}>
            <View style={[styles.dot, { backgroundColor: '#f5a95c' }]} />
            <ThemedText type="small" themeColor="textSecondary">
              本月日均消费
            </ThemedText>
          </View>
          <ThemedText type="small">RM{dailyAverage.toFixed(2)}</ThemedText>
        </View>
        <View style={styles.footerItem}>
          <View style={styles.footerItemLeft}>
            <View style={[styles.dot, { backgroundColor: theme.accent }]} />
            <ThemedText type="small" themeColor="textSecondary">
              剩余每日可消费
            </ThemedText>
          </View>
          <ThemedText type="small">RM{dailyRemaining.toFixed(2)}</ThemedText>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  stats: {
    alignItems: 'center',
    gap: 2,
  },
  footerRow: {
    gap: Spacing.two,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
