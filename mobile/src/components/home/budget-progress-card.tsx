import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { SetBudgetLink } from '@/components/home/set-budget-link';
import { PaceBar } from '@/components/ui/pace-bar';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import type { BudgetPace } from '@/hooks/use-home-view-data';
import { useTheme } from '@/hooks/use-theme';
import { formatCurrency } from '@/utils/format';

type BudgetProgressCardProps = {
  hasBudget: boolean;
  budgetTotal: number;
  spent: number;
  percentage: number;
  timePercentage: number;
  pace: BudgetPace;
  paceDiff: number;
  dailyAverage: number;
  dailyRemaining: number;
};

// 预算卡：节奏条 + 快慢判断 + 日均消费/剩余每日可消费。
// 纯展示组件，数字全部由 buildHomeViewData 算好传进来——两套布局必须显示同一组数。
//
// 这张卡原来是个环形进度，只回答"花了百分之多少"。但光有这个数看不出好坏：
// 月中花掉 60% 是超速，月末花掉 60% 是省钱。所以改成横条 + 一个"今天走到月份哪里"的刻度，
// 把预算进度和时间进度放在同一根轴上比，一眼就知道该不该收着点花。
export function BudgetProgressCard({
  hasBudget,
  budgetTotal,
  spent,
  percentage,
  timePercentage,
  pace,
  paceDiff,
  dailyAverage,
  dailyRemaining,
}: BudgetProgressCardProps) {
  const theme = useTheme();

  const paceColor = pace === 'ahead' ? theme.expense : pace === 'behind' ? theme.income : theme.textSecondary;
  const paceText =
    pace === 'ahead'
      ? `比时间进度快 ${Math.round(paceDiff)}%`
      : pace === 'behind'
        ? `比时间进度慢 ${Math.round(Math.abs(paceDiff))}%`
        : '跟时间进度持平';

  return (
    <ThemedView type="cardBorder" style={styles.card}>
      <View style={styles.headerRow}>
        <ThemedText style={styles.title}>本月预算</ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.headerMeta}>
          {hasBudget ? `已用 ${formatCurrency(spent)} / ${formatCurrency(budgetTotal)}` : `本月已花 ${formatCurrency(spent)}`}
        </ThemedText>
      </View>

      <View style={styles.barWrap}>
        <PaceBar
          percentage={percentage}
          markerPercentage={hasBudget ? timePercentage : undefined}
          markerLabel={`今天 · ${Math.round(timePercentage)}%`}
          color={theme.cardHighlight}
          trackColor={theme.backgroundSelected}
          markerColor={theme.text}
        />
      </View>

      <View style={styles.paceRow}>
        {hasBudget ? (
          <>
            <ThemedText style={[styles.usedText, { color: theme.cardHighlight }]}>已用 {Math.round(percentage)}%</ThemedText>
            <View style={styles.paceRight}>
              {pace !== 'even' ? (
                <Ionicons name={pace === 'ahead' ? 'arrow-up' : 'arrow-down'} size={14} color={paceColor} />
              ) : null}
              <ThemedText style={[styles.paceText, { color: paceColor }]}>{paceText}</ThemedText>
            </View>
          </>
        ) : (
          <SetBudgetLink />
        )}
      </View>

      <View style={[styles.footerRow, { backgroundColor: theme.cardHighlight + '1A', borderTopColor: theme.backgroundSelected }]}>
        <View style={styles.footerItem}>
          <ThemedText themeColor="textSecondary" style={styles.footerLabel}>
            本月日均消费
          </ThemedText>
          <ThemedText style={styles.footerValue}>{formatCurrency(dailyAverage)}</ThemedText>
        </View>

        <View style={[styles.footerDivider, { backgroundColor: theme.backgroundSelected }]} />

        <View style={styles.footerItem}>
          <ThemedText themeColor="textSecondary" style={styles.footerLabel}>
            剩余每日可消费
          </ThemedText>
          {/* 超支之后这个数是负的，继续用强调色显示会让人以为还有额度，所以翻成支出色 */}
          <ThemedText style={[styles.footerValue, { color: dailyRemaining < 0 ? theme.expense : theme.cardHighlight }]}>
            {formatCurrency(dailyRemaining)}
          </ThemedText>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    paddingTop: 18,
    paddingHorizontal: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  title: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
  },
  headerMeta: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500',
  },
  barWrap: {
    marginTop: 20,
  },
  paceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  usedText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  paceRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  paceText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  // 负 margin 把这条金色带铺满卡片宽度，再把卡片底部的圆角补回来——
  // 卡片本身 paddingBottom 是 0，底部留白由这条带子自己的 padding 给
  footerRow: {
    flexDirection: 'row',
    marginTop: 14,
    marginHorizontal: -20,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  footerItem: {
    flex: 1,
    gap: 2,
  },
  footerLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  footerValue: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '600',
  },
  footerDivider: {
    width: StyleSheet.hairlineWidth,
    marginHorizontal: 14,
  },
});
