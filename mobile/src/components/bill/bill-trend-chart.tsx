import { Ionicons } from '@expo/vector-icons';
import { useId, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Line, Path, Rect, Stop } from 'react-native-svg';

import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import {
  BillTrendMetricLabels,
  type BillTrendMetric,
  type BillTrendPoint,
} from '@/hooks/use-bill-overview-data';
import { useTheme } from '@/hooks/use-theme';
import { formatCurrency } from '@/utils/format';

/** 画布高度。写死是因为它得跟卡片里其余几行的份量配平，不该跟着数据的多少变 */
const CHART_HEIGHT = 130;
/**
 * 作图区距画布上下边的内距。
 *
 * **不留这个内距，零值那条线会消失**：没有它时最小值正好落在 y = CHART_HEIGHT，
 * 也就是 SVG 的下边界上；一条 2px 的线是**以坐标为中心**画的，于是下面那 1px 在画布外、
 * 被裁掉，只剩贴着边的 1px——在卡片底色上几乎看不见。
 * 峰顶同理：最大值落在 y = 0，上面那一半同样被裁。
 * 所以作图区要从画布边上缩进来，缩的量至少是线宽的一半，这里给足到 6/8。
 */
const PLOT_TOP = 8;
const PLOT_BOTTOM = 6;
/** 横轴上最多摆几个标签。再多就开始互相压字 */
const MAX_AXIS_LABELS = 12;
/** 每个横轴标签占多宽。写死是因为标签要**居中对齐到它那个数据点**，得先知道往左退多少 */
const AXIS_LABEL_WIDTH = 34;

const METRIC_ITEMS = (['expense', 'income', 'balance'] as const).map((key) => ({
  key,
  label: BillTrendMetricLabels[key],
}));

type BillTrendChartProps = {
  points: BillTrendPoint[];
  metric: BillTrendMetric;
  onMetricChange: (metric: BillTrendMetric) => void;
};

/**
 * 支出趋势：一整段时间铺满的折线（或柱子），配最大值 / 均值 / 最小值三条注解。
 *
 * **横轴是整段铺满的，没账的那一格也在**（高度 0，见 buildBillOverviewData 里 trendSpan 的说明）。
 * 折线读的是形状，抽掉空月份会让两个点直接连起来，看着像连续两个月——那是假的。
 * 这一点跟底下那张汇总表故意不一样：表读的是数字，列一行「8月 0.00」只是噪音。
 *
 * **三条线共用同一批点**，切指标时横轴一格都不动。做成三次查询的话，
 * 切过去的瞬间横轴会重排一下，那半秒的跳动会让人以为自己看错了时间段。
 *
 * **折线/柱子两种画法**，右上角那个图标切。不是装饰：
 * 「一年十二个月的走势」适合折线（读趋势），「一周七天」适合柱子（读单天的多少）——
 * 同一份数据，问的问题不同。默认给折线，因为进这一页最常看的是年和月。
 *
 * 曲线用 Catmull-Rom 转三次贝塞尔做平滑，不是直接连直线段：
 * 折线的尖角会把"这个月特别高"这件事放大成一根刺，而月度开销本来就是连续变化的量。
 * 平滑只改观感不改数值——每个数据点仍然精确落在它该在的位置上，曲线只是补了点之间那段。
 */
export function BillTrendChart({ points, metric, onMetricChange }: BillTrendChartProps) {
  const theme = useTheme();
  const gradientId = `billTrend${useId().replace(/:/g, '')}`;
  const [width, setWidth] = useState(0);
  const [mode, setMode] = useState<'line' | 'bar'>('line');

  const values = points.map((point) => point[metric]);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const average = values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
  // 全是 0 的时候 span 会变成 0，后面每个除法都成 NaN。退回 1 让线平贴在底部
  const span = max - min || 1;

  const color =
    metric === 'expense' ? theme.expense : metric === 'income' ? theme.income : theme.cardHighlight;

  const toX = (index: number) =>
    points.length > 1 ? (index / (points.length - 1)) * width : width / 2;
  const plotHeight = CHART_HEIGHT - PLOT_TOP - PLOT_BOTTOM;
  const toY = (value: number) => PLOT_TOP + plotHeight - ((value - min) / span) * plotHeight;
  // 面积图往下封口封到这里，不是封到画布底边——它得跟零值那条线同高
  const baseline = toY(min);

  // 横轴标签的抽样步长：点多了就隔几个摆一个，保证最多 MAX_AXIS_LABELS 个
  const stride = Math.max(1, Math.ceil(points.length / MAX_AXIS_LABELS));

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.titleRow}>
        <Ionicons name="trending-up" size={16} color={theme.text} />
        <ThemedText style={styles.cardTitle}>{BillTrendMetricLabels[metric]}趋势</ThemedText>
        <Pressable
          onPress={() => setMode(mode === 'line' ? 'bar' : 'line')}
          hitSlop={10}
          style={styles.modeButton}>
          <Ionicons
            name={mode === 'line' ? 'stats-chart' : 'analytics'}
            size={18}
            color={theme.textSecondary}
          />
        </Pressable>
      </View>

      <View style={styles.plot} onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}>
        <ThemedText themeColor="textSecondary" style={styles.extreme}>
          最大值:{formatCurrency(max)}
        </ThemedText>

        {/* 量出宽度之前不画：SVG 的每个坐标都要除以宽度，0 宽度画出来是一条贴在左边的线 */}
        {width > 0 ? (
          <Svg width={width} height={CHART_HEIGHT}>
            <Defs>
              <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                {/* 面积从线底下往下淡出：不淡出的话一整块实色会盖过线本身，
                    而要读的是线的形状，面积只是帮它"有分量" */}
                <Stop offset="0" stopColor={color} stopOpacity="0.45" />
                <Stop offset="1" stopColor={color} stopOpacity="0.02" />
              </LinearGradient>
            </Defs>

            {mode === 'line' ? (
              <>
                <Path d={areaPath(values, toX, toY, baseline)} fill={`url(#${gradientId})`} />
                <Path
                  d={linePath(values, toX, toY)}
                  stroke={color}
                  strokeWidth={2}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            ) : (
              values.map((value, index) => {
                // 柱子宽度留 40% 当间隙：挨在一起的柱子会被读成一整块面积
                const slot = width / values.length;
                const barWidth = slot * 0.6;
                const y = toY(value);
                const zeroY = toY(0);
                return (
                  <Rect
                    key={points[index].key}
                    x={slot * index + (slot - barWidth) / 2}
                    // 结余可能是负的，柱子要从 0 那条线往下长，所以取两点中较高的那个当顶
                    y={Math.min(y, zeroY)}
                    width={barWidth}
                    height={Math.max(Math.abs(zeroY - y), 1)}
                    rx={2}
                    fill={color}
                    opacity={0.85}
                  />
                );
              })
            )}

            {/* 均值那条虚线。画在线的上面：它是一把尺子，被面积盖住就量不了东西了 */}
            <Line
              x1={0}
              y1={toY(average)}
              x2={width}
              y2={toY(average)}
              stroke={theme.textSecondary}
              strokeWidth={1}
              strokeDasharray="4 4"
              opacity={0.55}
            />
          </Svg>
        ) : (
          <View style={{ height: CHART_HEIGHT }} />
        )}

        <ThemedText themeColor="textSecondary" style={[styles.average, { top: toY(average) - 16 }]}>
          均值:{formatCurrency(average)}
        </ThemedText>

        <ThemedText themeColor="textSecondary" style={styles.extremeBottom}>
          最小值:{formatCurrency(min)}
        </ThemedText>
      </View>

      <View style={styles.axis}>
        {width > 0
          ? points.map((point, index) => {
              if (index % stride !== 0) return null;
              // 每个标签**绝对定位在它那个点的正下方**，不是把几个标签平均摊在一行上：
              // 摊开的话「1月」会落在第一个点和第二个点中间，读起来整条轴错开半格。
              // 两头夹一下，免得首尾两个标签有一半跑到卡片外面
              const left = Math.min(Math.max(toX(index) - AXIS_LABEL_WIDTH / 2, 0), width - AXIS_LABEL_WIDTH);
              return (
                <ThemedText
                  key={point.key}
                  themeColor="textSecondary"
                  numberOfLines={1}
                  style={[styles.axisLabel, { left }]}>
                  {point.label}
                </ThemedText>
              );
            })
          : null}
      </View>

      <View style={styles.metricRow}>
        <SegmentedTabs items={METRIC_ITEMS} value={metric} onChange={onMetricChange} />
      </View>
    </ThemedView>
  );
}

/**
 * Catmull-Rom 转三次贝塞尔：每两个相邻点之间插一段曲线，控制点由**前后各一个**邻居决定。
 *
 * 张力取 1/6 是 Catmull-Rom 的标准换算（曲线经过每一个控制点，而不是被它们拉着走）。
 * 换句话说：数据点的位置是精确的，弯的只是点跟点之间那一段。
 *
 * **控制点的 y 要夹在这一段两个端点之间**，否则会过冲。
 * 这不是美观问题，是**画出假数据**：只有一个月有账时（0,0,…,208,…,0,0），
 * 裸的 Catmull-Rom 会在尖峰两侧甩到零以下，于是图上出现了"那两个月花了负数"——
 * 而支出不可能是负的。夹住之后靠的是三次贝塞尔的凸包性质：
 * 四个控制点的 y 都落在 [端点最小, 端点最大] 里，整段曲线就一定也在里面，
 * 一根都甩不出去。代价是尖峰旁边那两段会平一点，换来的是曲线上每一个位置都是可能的值。
 */
function linePath(values: number[], toX: (i: number) => number, toY: (v: number) => number): string {
  if (values.length === 0) return '';
  if (values.length === 1) return `M ${toX(0)} ${toY(values[0])}`;

  let d = `M ${toX(0)} ${toY(values[0])}`;
  for (let i = 0; i < values.length - 1; i += 1) {
    // 两头没有邻居，就拿自己当邻居——效果是端点那一段变成直线，不会往外甩出去
    const p0 = { x: toX(Math.max(i - 1, 0)), y: toY(values[Math.max(i - 1, 0)]) };
    const p1 = { x: toX(i), y: toY(values[i]) };
    const p2 = { x: toX(i + 1), y: toY(values[i + 1]) };
    const p3 = {
      x: toX(Math.min(i + 2, values.length - 1)),
      y: toY(values[Math.min(i + 2, values.length - 1)]),
    };

    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;

    // 这一段允许出现的 y 区间，就是它自己两个端点围出来的那一段
    const low = Math.min(p1.y, p2.y);
    const high = Math.max(p1.y, p2.y);
    const clamp = (y: number) => Math.min(Math.max(y, low), high);
    const c1y = clamp(p1.y + (p2.y - p0.y) / 6);
    const c2y = clamp(p2.y - (p3.y - p1.y) / 6);

    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

/** 面积 = 同一条曲线 + 沿基线闭合。共用 linePath，两者的形状永远不会对不上 */
function areaPath(
  values: number[],
  toX: (i: number) => number,
  toY: (v: number) => number,
  baseline: number,
): string {
  if (values.length === 0) return '';
  return `${linePath(values, toX, toY)} L ${toX(values.length - 1)} ${baseline} L ${toX(0)} ${baseline} Z`;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    padding: 16,
    gap: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  modeButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 三条注解都绝对定位在画布上：它们标的是画布上的位置（顶、均值线、底），
  // 参与布局的话会把画布挤扁
  plot: {
    height: CHART_HEIGHT,
    justifyContent: 'center',
  },
  extreme: {
    position: 'absolute',
    top: 0,
    left: 0,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '500',
  },
  extremeBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '500',
  },
  // 均值标签贴在虚线**右端上方**：压在线上会被线划掉，放左边会跟最大值那行撞上
  average: {
    position: 'absolute',
    right: 0,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '500',
  },
  // 标签是绝对定位的，所以这一条自己要有高度，否则它会塌成 0 把下面的控件顶上来
  axis: {
    height: 14,
    marginTop: 4,
  },
  axisLabel: {
    position: 'absolute',
    top: 0,
    width: AXIS_LABEL_WIDTH,
    textAlign: 'center',
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '500',
  },
  metricRow: {
    alignSelf: 'center',
    minWidth: 220,
    marginTop: 4,
  },
});
