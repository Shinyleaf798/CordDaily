import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { ThemedText } from '@/components/ui/themed-text';

type PaceBarProps = {
  /** 主进度，0-100，超过 100 视觉上封顶（超支时条是满的，超了多少由旁边的文字说） */
  percentage: number;
  /** 参考刻度的位置，0-100。预算卡拿它标"今天走到月份的哪里" */
  markerPercentage?: number;
  /** 刻度上方的小字，比如"今天 · 50%" */
  markerLabel?: string;
  height?: number;
  color: string;
  trackColor: string;
  markerColor: string;
};

// 带参考刻度的横向进度条。跟 CircularProgress 一样是纯展示的通用组件，不认识"预算"这个概念——
// 它只知道"一个进度 + 一个参考位置"，所以之后账户额度、报销进度之类也能直接复用。
//
// 渐变用 react-native-svg 画（项目里已经有这个依赖，不为了一条渐变再装 expo-linear-gradient）。
// SVG 下面垫了一层纯色，万一某个平台上百分比宽度的 Svg 没量出尺寸，退化成纯色条而不是空条。
export function PaceBar({
  percentage,
  markerPercentage,
  markerLabel,
  height = 14,
  color,
  trackColor,
  markerColor,
}: PaceBarProps) {
  const gradientId = `paceBar${useId().replace(/:/g, '')}`;
  const clamped = Math.max(0, Math.min(100, percentage));
  const marker = markerPercentage === undefined ? undefined : Math.max(0, Math.min(100, markerPercentage));

  return (
    <View style={styles.wrap}>
      {marker !== undefined && markerLabel ? (
        <View style={[styles.markerLabelAnchor, { left: `${marker}%` }]}>
          <View style={styles.markerLabelCenter}>
            <ThemedText style={styles.markerLabel}>{markerLabel}</ThemedText>
          </View>
        </View>
      ) : null}

      <View style={[styles.track, { height, borderRadius: height / 2, backgroundColor: trackColor }]}>
        <View style={{ width: `${clamped}%`, height: '100%', backgroundColor: color }}>
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={color} stopOpacity={0.55} />
                <Stop offset="1" stopColor={color} stopOpacity={1} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" rx={height / 2} fill={`url(#${gradientId})`} />
          </Svg>
        </View>
      </View>

      {marker !== undefined ? (
        <View
          style={[
            styles.marker,
            { left: `${marker}%`, height: height + 8, top: -4, backgroundColor: markerColor },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
  },
  track: {
    overflow: 'hidden',
  },
  marker: {
    position: 'absolute',
    width: 2,
    borderRadius: 1,
  },
  markerLabelAnchor: {
    position: 'absolute',
    top: -18,
  },
  // 用固定宽度 + 负 margin 把文字压在刻度正中间，而不是 translateX: '-50%'——
  // 百分比 transform 在 RN 各版本上的支持不一致，这个写法在哪都是准的
  markerLabelCenter: {
    width: 96,
    marginLeft: -48,
    alignItems: 'center',
  },
  markerLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500',
  },
});
