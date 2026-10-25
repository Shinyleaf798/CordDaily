import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { heatLevel } from '@/components/calendar/calendar-day-cell';
import type { CalendarTopProps } from '@/components/calendar/layouts/types';
import { ThemedText } from '@/components/ui/themed-text';
import type { CalendarDay } from '@/hooks/use-calendar-view-data';
import { useTheme } from '@/hooks/use-theme';
import { formatAmount, formatCompactAmount } from '@/utils/format';
import { WEEKDAY_LABELS } from '@/utils/date';

/**
 * 四档深浅的透明度，跟经典格子（calendar-day-cell）同一套分档，但每档都更实：
 * 经典那套是"卡片上点一点颜色"，这里整页没有卡片，格子本身就是主角，淡了等于没有
 */
const HEAT_ALPHA = ['', '33', '59', '8c', 'cc'];

/**
 * 上半 · 热力：不用卡片，直接铺在页面上。
 *
 * 跟经典的区别不只是去掉卡片：
 * - 顶上是大号月份数字 + 年份，左右翻月挪到右边——月份就是这一页的标题
 * - 本月三个数（支出 / 收入 / 结余）并排，不是一个大数 + 一排小数：
 *   日历页要回答的是"这个月整体怎么样"，三个数一样重
 * - 每一格**一直有底色**（没花钱的日子是卡片色），花得越多越亮，底下一条「少…多」图例；
 *   选中的那天用描边而不是整格涂满，涂满会盖掉它自己那一档的颜色
 */
export function HeatTop({
  data,
  month,
  selectedKey,
  onSelectDay,
  onPrevMonth,
  onNextMonth,
  onBackToCurrentMonth,
}: CalendarTopProps) {
  const theme = useTheme();
  const net = data.monthIncome - data.monthExpense;

  return (
    <View style={styles.wrap}>
      <View style={styles.monthRow}>
        <View style={styles.monthTitle}>
          <ThemedText style={styles.monthNumber}>{month.getMonth() + 1}</ThemedText>
          <ThemedText style={styles.monthUnit}>月</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.year}>
            {month.getFullYear()}
          </ThemedText>
        </View>
        {/* 翻远了之后的退路，本月时不显示（理由同经典那套） */}
        {onBackToCurrentMonth ? (
          <Pressable onPress={onBackToCurrentMonth} hitSlop={8}>
            <ThemedText type="small" style={[styles.backToday, { color: theme.cardHighlight }]}>
              回到本月
            </ThemedText>
          </Pressable>
        ) : null}
        <Pressable onPress={onPrevMonth} accessibilityLabel="上个月" style={styles.arrow}>
          <Ionicons name="chevron-back" size={20} color={theme.text} />
        </Pressable>
        <Pressable onPress={onNextMonth} accessibilityLabel="下个月" style={styles.arrow}>
          <Ionicons name="chevron-forward" size={20} color={theme.text} />
        </Pressable>
      </View>

      <View style={styles.stats}>
        <Stat label="支出" value={formatAmount(data.monthExpense)} />
        <Stat label="收入" value={formatAmount(data.monthIncome)} color={theme.income} />
        <Stat label="结余" value={formatAmount(net)} color={net < 0 ? theme.expense : undefined} />
      </View>

      <View style={styles.weekRow}>
        {WEEKDAY_LABELS.map((label) => (
          <ThemedText key={label} themeColor="textSecondary" style={styles.weekday}>
            {label.slice(-1)}
          </ThemedText>
        ))}
      </View>

      <View style={styles.grid}>
        {data.weeks.map((week, weekIndex) => (
          <View key={weekIndex} style={styles.weekRow}>
            {week.map((day, dayIndex) =>
              day ? (
                <HeatCell
                  key={day.key}
                  day={day}
                  maxExpense={data.maxDayExpense}
                  isSelected={day.key === selectedKey}
                  onPress={() => onSelectDay(day.key)}
                />
              ) : (
                <View key={`blank-${dayIndex}`} style={styles.blank} />
              ),
            )}
          </View>
        ))}
      </View>

      <View style={styles.legend}>
        <ThemedText themeColor="textSecondary" style={styles.legendText}>
          少
        </ThemedText>
        {HEAT_ALPHA.map((alpha, level) => (
          <View
            key={level}
            style={[
              styles.legendSwatch,
              { backgroundColor: level === 0 ? theme.backgroundElement : theme.cardHighlight + alpha },
            ]}
          />
        ))}
        <ThemedText themeColor="textSecondary" style={styles.legendText}>
          多
        </ThemedText>
      </View>
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.stat}>
      <ThemedText themeColor="textSecondary" style={styles.statLabel}>
        {label}
      </ThemedText>
      <ThemedText numberOfLines={1} adjustsFontSizeToFit style={[styles.statValue, color ? { color } : null]}>
        {value}
      </ThemedText>
    </View>
  );
}

type HeatCellProps = {
  day: CalendarDay;
  maxExpense: number;
  isSelected: boolean;
  onPress: () => void;
};

/**
 * 一格：日期 + 当天金额。三种"没数字"的情况跟经典格子同一个画法
 * （只有收入 → 绿色 +金额；有账但合计 0 → 一个小点；没账 → 空着），理由写在 CalendarDayCell
 */
function HeatCell({ day, maxExpense, isSelected, onPress }: HeatCellProps) {
  const theme = useTheme();
  const level = heatLevel(day.expense, maxExpense);
  // 以后的日子不铺底色：还没到的日子跟"那天没花钱"不是一回事
  const backgroundColor = day.isFuture
    ? 'transparent'
    : level > 0
      ? theme.cardHighlight + HEAT_ALPHA[level]
      : theme.backgroundElement;
  // 今天用强调色标出来，但格子本身已经涂到很深的那两档时，强调色写在强调色上就看不见了，退回正文色（加粗还在）
  const dayColor = day.isFuture
    ? theme.textSecondary
    : day.isToday && level < 3
      ? theme.cardHighlight
      : theme.text;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      style={[styles.cell, { backgroundColor }, isSelected && { borderWidth: 2, borderColor: theme.cardHighlight }]}>
      <ThemedText style={[styles.cellDay, { color: dayColor }, (day.isToday || isSelected) && styles.cellDayStrong]}>
        {day.dayOfMonth}
      </ThemedText>
      {day.expense > 0 ? (
        <ThemedText numberOfLines={1} themeColor="textSecondary" style={styles.cellAmount}>
          {formatCompactAmount(day.expense)}
        </ThemedText>
      ) : day.income > 0 ? (
        <ThemedText numberOfLines={1} style={[styles.cellAmount, { color: theme.income }]}>
          +{formatCompactAmount(day.income)}
        </ThemedText>
      ) : day.hasTransactions ? (
        <View style={[styles.dot, { backgroundColor: theme.textSecondary }]} />
      ) : (
        <View style={styles.amountPlaceholder} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 4,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 8,
  },
  monthTitle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  monthNumber: {
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '700',
  },
  monthUnit: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
  year: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  backToday: {
    fontWeight: '600',
    marginRight: 4,
  },
  arrow: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stats: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 18,
  },
  stat: {
    flex: 1,
    gap: 2,
  },
  statLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  statValue: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  grid: {
    gap: 3,
    marginTop: 6,
  },
  weekRow: {
    flexDirection: 'row',
    gap: 3,
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '500',
  },
  blank: {
    flex: 1,
    height: 52,
  },
  cell: {
    flex: 1,
    height: 52,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  cellDay: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '500',
  },
  cellDayStrong: {
    fontWeight: '700',
  },
  cellAmount: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  amountPlaceholder: {
    height: 13,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginVertical: 4.5,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    marginTop: 8,
  },
  legendText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500',
  },
  legendSwatch: {
    width: 14,
    height: 10,
    borderRadius: 2,
  },
});
