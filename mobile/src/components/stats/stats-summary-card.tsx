import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { formatAmount, formatCurrency } from '@/utils/format';

type StatsSummaryCardProps = {
  monthLabel: string;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  /** 看的不是本月时给一个退路，是本月时为 undefined */
  onBackToCurrentMonth?: () => void;
  expense: number;
  deltaAmount: number;
  /** 上月没有支出时是 null，这时只说绝对值不说百分比 */
  deltaPercentage: number | null;
  previousExpense: number;
};

/**
 * 统计页顶部的锚点卡：本月支出 + 跟上月比。
 *
 * 排版照抄首页的 MonthSummaryCard（小标签 + 金色 RM + 大数字 + 一条分割线下的副信息），
 * 但**没有**复用那个组件：那张卡的三格是收入/支出/结余，这张是一个数 + 一个环比，
 * 硬抽成公共组件会抽出一个两边都要传七八个 prop、内部全是条件分支的壳。
 * 共用的是排版语言，不是代码——首页那张卡已经教会用户"这个形状顶上那个数是本屏主角"。
 *
 * 环比用红绿：这里的红绿不是"收入/支出"，是"比上月多花/少花"。
 * 借用同一对语义色是合理的——两处都是"这是好事还是坏事"，方向一致。
 *
 * 月份切换行也在这张卡里，跟日历页的 CalendarSummaryHeader 一样：
 * 两页都是"按月翻着看"，翻月的控件长在同一个位置、同一个样子，换页不用重新找。
 * 设计稿上它原本是右上角一个 chip，改掉是为了这个一致性，顺带白捡一个「回到本月」的退路。
 */
export function StatsSummaryCard({
  monthLabel,
  onPrevMonth,
  onNextMonth,
  onBackToCurrentMonth,
  expense,
  deltaAmount,
  deltaPercentage,
  previousExpense,
}: StatsSummaryCardProps) {
  const theme = useTheme();

  const hasComparison = previousExpense > 0 || expense > 0;
  const isUp = deltaAmount > 0;
  // 持平（差额是 0）时不染色：染成绿的会让人以为省了钱
  const deltaColor = deltaAmount === 0 ? theme.textSecondary : isUp ? theme.expense : theme.income;

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.monthRow}>
        <Pressable onPress={onPrevMonth} hitSlop={10} style={styles.arrow}>
          <Ionicons name="chevron-back" size={18} color={theme.textSecondary} />
        </Pressable>

        <ThemedText style={styles.monthLabel}>{monthLabel}</ThemedText>

        <Pressable onPress={onNextMonth} hitSlop={10} style={styles.arrow}>
          <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
        </Pressable>

        {onBackToCurrentMonth ? (
          <Pressable onPress={onBackToCurrentMonth} hitSlop={8} style={styles.backToday}>
            <ThemedText style={[styles.backTodayText, { color: theme.cardHighlight }]}>回到本月</ThemedText>
          </Pressable>
        ) : null}
      </View>

      <ThemedText themeColor="textSecondary" style={styles.label}>
        支出
      </ThemedText>

      <View style={styles.amountRow}>
        <ThemedText style={[styles.currency, { color: theme.cardHighlight }]}>RM</ThemedText>
        <ThemedText style={styles.amount}>{formatAmount(expense)}</ThemedText>
      </View>

      <View style={[styles.footer, { borderTopColor: theme.backgroundSelected }]}>
        {hasComparison ? (
          <>
            <View style={[styles.chip, { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText style={[styles.chipText, { color: deltaColor }]}>
                {deltaPercentage === null
                  ? '上月没有记账'
                  : `${isUp ? '↑' : deltaAmount === 0 ? '·' : '↓'} ${Math.abs(deltaPercentage).toFixed(1)}%`}
              </ThemedText>
            </View>
            <ThemedText themeColor="textSecondary" style={styles.footerNote}>
              比上月 {deltaAmount >= 0 ? '+' : '-'}
              {formatCurrency(Math.abs(deltaAmount))}
            </ThemedText>
          </>
        ) : (
          <ThemedText themeColor="textSecondary" style={styles.footerNote}>
            这个月还没有支出记录
          </ThemedText>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 18,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  arrow: {
    padding: 2,
  },
  monthLabel: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    // 月份宽度会随位数变（2026年9月 / 2026年12月），固定一个最小宽度，箭头才不会左右跳
    minWidth: 96,
    textAlign: 'center',
  },
  backToday: {
    marginLeft: 'auto',
  },
  backTodayText: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    letterSpacing: 0.4,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 6,
  },
  currency: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '600',
  },
  amount: {
    fontSize: 36,
    lineHeight: 42,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  // 靠右：左边那个 chip 是结论，右边是佐证，两者之间留白比并排更好读
  footerNote: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    marginLeft: 'auto',
  },
});
