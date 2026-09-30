import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { MonthChip } from '@/components/home/month-chip';
import { EditBudgetLink, SetBudgetLink } from '@/components/home/set-budget-link';
import { CircularProgress } from '@/components/ui/circular-progress';
import { ThemedText } from '@/components/ui/themed-text';
import { ScreenPadding } from '@/constants/theme';
import type { HomeTopProps } from '@/components/home/layouts/types';
import { useTheme } from '@/hooks/use-theme';
import { formatAmount, formatCurrency } from '@/utils/format';

/**
 * 圆环直径 = 内容宽度 × 这个比例，上限 RING_MAX_SIZE。
 *
 * 不写死一个像素值：圆环是这一段的主角，它该占多大是**相对于页面**的一件事。
 * 写死 188 的话，屏幕边距一变（这次就变了 8），比例就跟着悄悄漂移；
 * 换台小屏手机它会顶满两边，换台大屏又缩成中间一小坨。
 *
 * 上限是给平板和折叠屏用的：内容宽度到了 600，圆环没必要真长到 370——
 * 那时候它已经不是"一个能一眼看完的表盘"，而是一堵墙了。
 */
const RING_SIZE_RATIO = 0.55;
const RING_MAX_SIZE = 260;
// 环宽跟直径同比例缩放（原来是 14/188），否则环一放大就显得细得像根头发丝
const RING_STROKE_RATIO = 14 / 188;

// 上半「金环」：把"本月还能花多少"做成主角，月度收支退成一条三栏 pill。
// 信息比节奏条少，但第一眼看到的就是最该看的那个数。
export function RingTop({ data }: HomeTopProps) {
  const theme = useTheme();

  // useWindowDimensions 而不是 Dimensions.get：转屏和分屏时它会触发重渲染，后者拿到的是启动时的快照
  const { width } = useWindowDimensions();
  const ringSize = Math.min(Math.round((width - ScreenPadding * 2) * RING_SIZE_RATIO), RING_MAX_SIZE);
  const ringStroke = Math.round(ringSize * RING_STROKE_RATIO);

  // 超支之后环和中心数字都翻成支出色：还用强调色的话，一个负数配金色看着像还有额度
  const isOverspent = data.hasBudget && data.remaining < 0;
  const ringColor = isOverspent ? theme.expense : theme.cardHighlight;
  // 没设预算时环没有意义，中心退回显示本月支出，别让人以为"还能花 RM0.00"
  const centerLabel = data.hasBudget ? '本月还能花' : '本月支出';
  const centerValue = data.hasBudget ? data.remaining : data.expense;

  return (
    // 这一段不用 gap 排版：每块之间的距离不一样（18/18/12），是这套画法自己的韵律，
    // 所以各块自带 marginTop，而不是交给外面那个统一的 ScreenGap
    <View>
      <View style={styles.monthRow}>
        <MonthChip label={data.monthLabel} />
      </View>

      <View style={styles.ringWrap}>
        <CircularProgress
          percentage={data.percentage}
          size={ringSize}
          strokeWidth={ringStroke}
          color={ringColor}
          trackColor={theme.backgroundElement}>
          <View style={styles.ringCenter}>
            <ThemedText themeColor="textSecondary" style={styles.ringCaption}>
              {centerLabel}
            </ThemedText>
            <ThemedText style={[styles.ringValue, isOverspent && { color: theme.expense }]}>
              {formatCurrency(centerValue)}
            </ThemedText>
            {data.hasBudget ? (
              <View style={[styles.ringChip, { backgroundColor: ringColor }]}>
                <ThemedText style={[styles.ringChipText, { color: theme.onCardHighlight }]}>
                  已用 {Math.round(data.percentage)}%
                </ThemedText>
              </View>
            ) : null}
          </View>
        </CircularProgress>

        <View style={styles.ringFooterLink}>
          {data.hasBudget ? <EditBudgetLink label={`预算 ${formatCurrency(data.budgetTotal)}`} /> : <SetBudgetLink />}
        </View>
      </View>

      <View style={[styles.pill, { backgroundColor: theme.backgroundElement }]}>
        <View style={styles.pillCell}>
          <ThemedText themeColor="textSecondary" style={styles.pillLabel}>
            支出
          </ThemedText>
          <ThemedText style={styles.pillValue}>{formatAmount(data.expense)}</ThemedText>
        </View>
        <View style={[styles.pillDivider, { backgroundColor: theme.backgroundSelected }]} />
        <View style={styles.pillCell}>
          <ThemedText themeColor="textSecondary" style={styles.pillLabel}>
            收入
          </ThemedText>
          <ThemedText style={[styles.pillValue, { color: theme.income }]}>{formatAmount(data.income)}</ThemedText>
        </View>
        <View style={[styles.pillDivider, { backgroundColor: theme.backgroundSelected }]} />
        <View style={styles.pillCell}>
          <ThemedText themeColor="textSecondary" style={styles.pillLabel}>
            结余
          </ThemedText>
          <ThemedText style={[styles.pillValue, { color: data.balance < 0 ? theme.expense : theme.cardHighlight }]}>
            {formatAmount(data.balance)}
          </ThemedText>
        </View>
      </View>

      <View style={styles.miniCards}>
        <View style={[styles.miniCard, { backgroundColor: theme.backgroundElement }]}>
          <View style={styles.miniCardHead}>
            <Ionicons name="stats-chart-outline" size={14} color={theme.textSecondary} />
            <ThemedText themeColor="textSecondary" style={styles.miniCardLabel}>
              日均消费
            </ThemedText>
          </View>
          <ThemedText style={styles.miniCardValue}>{formatCurrency(data.dailyAverage)}</ThemedText>
        </View>

        <View style={[styles.miniCard, { backgroundColor: theme.backgroundElement }]}>
          <View style={styles.miniCardHead}>
            <Ionicons name="time-outline" size={14} color={theme.cardHighlight} />
            <ThemedText themeColor="textSecondary" style={styles.miniCardLabel}>
              剩余每日可花
            </ThemedText>
          </View>
          <ThemedText
            style={[styles.miniCardValue, { color: data.dailyRemaining < 0 ? theme.expense : theme.cardHighlight }]}>
            {formatCurrency(data.dailyRemaining)}
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // 月份 chip 是这一段的第一块，跟上面标题条的距离由首页容器的 paddingTop 给，
  // 所以它自己不带 marginTop
  monthRow: {
    flexDirection: 'row',
  },
  ringWrap: {
    alignItems: 'center',
    marginTop: 18,
  },
  ringCenter: {
    alignItems: 'center',
  },
  ringCaption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    letterSpacing: 1,
  },
  ringValue: {
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  ringChip: {
    marginTop: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  ringChipText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  // 换成"去设预算"的入口时外面包的是 View，所以这里只管间距、不放文字样式
  ringFooterLink: {
    marginTop: 10,
  },
  pill: {
    flexDirection: 'row',
    borderRadius: 18,
    paddingVertical: 14,
    marginTop: 18,
  },
  pillCell: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  pillLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  pillValue: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  pillDivider: {
    width: StyleSheet.hairlineWidth,
  },
  miniCards: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  miniCard: {
    flex: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 4,
  },
  miniCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  miniCardLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  miniCardValue: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '700',
  },
});
