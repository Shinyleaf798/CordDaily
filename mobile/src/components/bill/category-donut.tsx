import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { MAX_CHART_SLOTS, chartColorAt } from '@/constants/chart-palette';
import { ScreenPadding } from '@/constants/theme';
import type { CategoryStatGroup } from '@/hooks/use-bill-overview-data';
import { useChartPalette } from '@/hooks/use-chart-palette';
import { useTheme } from '@/hooks/use-theme';
import { formatCurrency } from '@/utils/format';

/** 环的直径 = 卡片内容宽度 × 这个比例，上限 RING_MAX。跟首页金环同一个路子：圆该多大是相对于页面的事 */
const RING_SIZE_RATIO = 0.62;
const RING_MAX = 200;
/** 环宽跟直径同比例缩放，否则环一放大就细得像根头发丝 */
const RING_STROKE_RATIO = 0.2;
/** 段与段之间留的缝，单位是弧长（px）。缝里露出的是卡片底色，所以两段颜色永远不会挨在一起 */
const SEGMENT_GAP = 3;

type CategoryDonutProps = {
  categories: CategoryStatGroup[];
  /** 环心那行小字：支出 / 收入 */
  typeLabel: string;
};

/**
 * 分类构成的环形图。分类那一页最上面那个圈。
 *
 * **它只回答"大概是个什么比例"**，精确比较交给底下那张按金额排好的列表。
 * 环形图读角度，而人对角度的判断远不如对长度准——两段 18% 和 21% 在圈上看着一样大。
 * 所以这两块是配套的：圈给一眼的印象，列表给能对账的数。
 *
 * **最多六段**（五个真分类 + 一个「其他」）。再多，相邻两段的颜色就开始糊在一起，
 * 而那时候该看的本来就是下面那张表。折叠进「其他」的那些在列表里照样一行不少。
 *
 * **它自己不是图例**——底下那张列表才是：每一行带一枚同色的小圆点 + 分类名 + 金额。
 * 这不只是体贴：浅色主题那套色板里有三档对比度低于 3:1，规则要求必须有"颜色之外的识别手段"，
 * 那张带色块和名字的列表就是（见 constants/chart-palette 顶上的说明）。
 * 所以这个组件**永远不单独出现**。
 *
 * 环心放合计，不是放百分比：进这一页想知道的第一件事是"这一段一共花了多少"，
 * 而占比每一段自己都写着。
 */
export function CategoryDonut({ categories, typeLabel }: CategoryDonutProps) {
  const theme = useTheme();
  const palette = useChartPalette();

  // useWindowDimensions 而不是 Dimensions.get：转屏和分屏时它会触发重渲染（同首页金环）
  const { width: windowWidth } = useWindowDimensions();
  // 卡片内容宽度 = 屏宽 - 页面左右留白 - 卡片左右内距
  const contentWidth = windowWidth - ScreenPadding * 2 - CARD_PADDING * 2;
  const size = Math.min(Math.round(contentWidth * RING_SIZE_RATIO), RING_MAX);
  const stroke = Math.round(size * RING_STROKE_RATIO);

  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const total = categories.reduce((sum, entry) => sum + entry.total, 0);

  // 前五名各占一段，剩下的加起来并成「其他」。列表那边不折叠——那是两块内容的分工
  const top = categories.slice(0, MAX_CHART_SLOTS);
  const rest = categories.slice(MAX_CHART_SLOTS);
  const segments = [
    ...top.map((entry, index) => ({
      key: entry.id,
      total: entry.total,
      color: chartColorAt(palette, index),
    })),
    ...(rest.length > 0
      ? [
          {
            key: '__other__',
            total: rest.reduce((sum, entry) => sum + entry.total, 0),
            color: palette.other,
          },
        ]
      : []),
  ];

  // 一段一段往下累，每段的起点是前面所有段的长度之和
  let consumed = 0;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={[styles.ringWrap, { width: size, height: size }]}>
        <Svg width={size} height={size}>
          {/* 整圈的底。合计是 0 时（这一段一笔账都没有）只剩这一圈灰，
              比画一个空白区域更像"有这个东西，只是现在是空的" */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={theme.backgroundSelected}
            strokeWidth={stroke}
            fill="none"
          />

          {/* 转 -90 度让第一段从十二点钟方向开始。不转的话它从三点钟开始，
              而"从顶上顺时针"是所有人读圆盘的默认方向 */}
          <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
            {total > 0
              ? segments.map((segment) => {
                  const length = (segment.total / total) * circumference;
                  const offset = consumed;
                  consumed += length;
                  // 缝从每段尾巴上扣，最短留 1px——一段占比极小的时候不能被缝吃成负数
                  const drawn = Math.max(length - SEGMENT_GAP, 1);
                  return (
                    <Circle
                      key={segment.key}
                      cx={size / 2}
                      cy={size / 2}
                      r={radius}
                      stroke={segment.color}
                      strokeWidth={stroke}
                      fill="none"
                      // 一条虚线，只有第一段"实线"——就是这一段本身，其余全是空
                      strokeDasharray={`${drawn} ${circumference - drawn}`}
                      // 负的 offset 把这段虚线往前推到它该在的位置
                      strokeDashoffset={-offset}
                      strokeLinecap="butt"
                    />
                  );
                })
              : null}
          </G>
        </Svg>

        {/* 环心的文字是普通 RN 文字，画在 SVG **外面**（绝对定位盖在圆心上）。
            塞进 <Svg> 里得用 SvgText，那套字体、行高、省略号的行为跟 App 其余部分都不一样 */}
        <View style={styles.center} pointerEvents="none">
          <ThemedText themeColor="textSecondary" style={styles.centerLabel}>
            {typeLabel}合计
          </ThemedText>
          <ThemedText style={styles.centerValue} numberOfLines={1} adjustsFontSizeToFit>
            {formatCurrency(total)}
          </ThemedText>
        </View>
      </View>
    </ThemedView>
  );
}

const CARD_PADDING = 16;

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: CARD_PADDING,
    alignItems: 'center',
  },
  ringWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 环心的内容绝对定位在圆的正中：参与布局的话它会把 SVG 挤走
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  centerLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  centerValue: {
    fontSize: 20,
    lineHeight: 27,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
});
