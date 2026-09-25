import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import type { TrendBar } from '@/hooks/use-stats-view-data';
import { useTheme } from '@/hooks/use-theme';
import { formatCompactAmount } from '@/utils/format';

type MonthTrendProps = {
  bars: TrendBar[];
};

const CHART_HEIGHT = 72;

/**
 * 月度支出趋势：一个月一根柱。
 *
 * **柱不是线**：月度花销是一个个离散的量，不是连续信号，几个点画折线是硬凑。
 * 也**只画支出**，不把收入叠上去——那会让"这个月比上个月高多少"这唯一要读的事变难。
 *
 * 颜色只有两档：正在看的那个月用强调色，其余退成灰。强调的是「哪根是现在」，
 * 不是「哪根最高」——按高低上色等于让颜色重复柱子已经说过的话，而且翻个月就全变一遍。
 *
 * 柱子有几根由派生层决定（见 buildStatsViewData 的 trend）：从最早有账的那个月画起，
 * 最多 6 根。中间没账的月份留一根空位，只剩月份标签——把它抽掉会让两个不相邻的月份
 * 挨在一起，看着像连续两个月。
 */
export function MonthTrend({ bars }: MonthTrendProps) {
  const theme = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.plot}>
        {bars.map((bar) => (
          <View key={bar.monthKey} style={styles.column}>
            {/* 金额只标在正在看的那根上：每根都标数字就成了一张竖着排的表格，
                柱子本身的高低反而没人看了 */}
            <ThemedText
              themeColor={bar.isActive ? undefined : 'textSecondary'}
              style={[styles.value, bar.isActive && { color: theme.cardHighlight }]}
              numberOfLines={1}>
              {bar.isActive ? formatCompactAmount(bar.total) : ' '}
            </ThemedText>

            <View style={styles.barSlot}>
              {/* 没账的月份不画柱子，只留下面的月份标签——
                  给它一个 1px 的小墩子会让"这个月是 0"看起来像"这个月花了一点点" */}
              {bar.total > 0 ? (
                <View
                  style={[
                    styles.bar,
                    {
                      height: `${Math.max(bar.relative, 4)}%`,
                      backgroundColor: bar.isActive ? theme.cardHighlight : theme.backgroundSelected,
                    },
                  ]}
                />
              ) : null}
            </View>

            <ThemedText
              themeColor={bar.isActive ? undefined : 'textSecondary'}
              style={[styles.tick, bar.isActive && { color: theme.cardHighlight }]}
              numberOfLines={1}>
              {bar.label}
            </ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  plot: {
    flexDirection: 'row',
    gap: 8,
  },
  // 每根柱子一栏，flex: 1 平分宽度——一根的时候它占满，六根的时候平分。
  // 不给固定宽度，否则柱子少的时候会全挤在左边
  column: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
  },
  // 柱子从底部往上长
  barSlot: {
    width: '100%',
    height: CHART_HEIGHT,
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    borderRadius: 4,
  },
  value: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
  },
  tick: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
  },
});
