import type { ComponentType } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThumbnailFrame } from '@/components/ui/page-style-sheet';
import type { HomeLayoutName, HomeSlot } from '@/constants/home-layout';
import { useTheme } from '@/hooks/use-theme';

/**
 * 首页「编辑」弹层里每个选项左边那张小缩略图：第一层两个整页预设（经典 / 金环），
 * 第二层上半、下半各两种画法。全部同一个外框（ThumbnailFrame），只画骨架不画真数据——
 * 要回答的是"横条还是圆环""一天一张卡还是通栏"，缩小的真页面反而看不清这个区别
 */
export const HomeSlotThumbnails: Record<HomeSlot, Record<HomeLayoutName, ComponentType>> = {
  top: { pace: TopPaceThumbnail, ring: TopRingThumbnail },
  bills: { pace: BillsCardsThumbnail, ring: BillsFlatThumbnail },
};

/** 上半 · 节奏条：总览卡（一个大数）+ 预算卡（一根条，竖线是今天走到哪） */
function TopPaceThumbnail() {
  const theme = useTheme();
  const card = { backgroundColor: theme.backgroundSelected, borderRadius: 4, padding: 4, gap: 3 };
  return (
    <ThumbnailFrame>
      <View style={card}>
        <View style={[styles.line, { width: '45%', backgroundColor: theme.textSecondary }]} />
        <View style={[styles.bigLine, { width: '75%', backgroundColor: theme.text }]} />
      </View>
      <View style={card}>
        <View style={[styles.track, { backgroundColor: theme.background }]}>
          <View style={[styles.fill, { width: '45%', backgroundColor: theme.cardHighlight }]} />
          <View style={[styles.tick, { left: '68%', backgroundColor: theme.text }]} />
        </View>
        <View style={[styles.line, { width: '60%', backgroundColor: theme.textSecondary }]} />
      </View>
    </ThumbnailFrame>
  );
}

/** 上半 · 金环：一张卡里一个环（还能花多少放在环心），底下一条收支 pill */
function TopRingThumbnail() {
  const theme = useTheme();
  return (
    <ThumbnailFrame>
      <View style={[styles.ringCard, { backgroundColor: theme.backgroundSelected }]}>
        <View
          style={[
            styles.ring,
            { borderColor: theme.background, borderTopColor: theme.cardHighlight, borderRightColor: theme.cardHighlight },
          ]}
        />
        <View style={[styles.pill, { backgroundColor: theme.background }]} />
      </View>
    </ThumbnailFrame>
  );
}

/** 下半 · 节奏条：一天一张卡，卡顶是那天的日期，卡里两三笔 */
function BillsCardsThumbnail() {
  const theme = useTheme();
  const card = { backgroundColor: theme.backgroundSelected, borderRadius: 4, padding: 4, gap: 3, flex: 1 };
  const row = [styles.line, { backgroundColor: theme.textSecondary }];
  return (
    <ThumbnailFrame>
      {[0, 1].map((i) => (
        <View key={i} style={card}>
          <View style={[styles.line, { width: '40%', backgroundColor: theme.cardHighlight }]} />
          <View style={[...row, { width: '85%' }]} />
          <View style={[...row, { width: '70%' }]} />
        </View>
      ))}
    </ThumbnailFrame>
  );
}

/** 下半 · 金环：通栏铺在页面底色上，日期标题下一条细线，不要卡片 */
function BillsFlatThumbnail() {
  const theme = useTheme();
  const row = [styles.line, { backgroundColor: theme.textSecondary }];
  const rule = { height: StyleSheet.hairlineWidth, backgroundColor: theme.textSecondary };
  return (
    <ThumbnailFrame>
      {[0, 1].map((i) => (
        <View key={i} style={styles.flatGroup}>
          <View style={[styles.line, { width: '40%', backgroundColor: theme.cardHighlight }]} />
          <View style={rule} />
          <View style={[...row, { width: '85%' }]} />
          <View style={[...row, { width: '70%' }]} />
        </View>
      ))}
    </ThumbnailFrame>
  );
}

/** 经典：三块圆角卡片叠在一起 */
export function ClassicThumbnail() {
  const theme = useTheme();
  const block = { backgroundColor: theme.backgroundSelected, borderRadius: 4 };
  return (
    <ThumbnailFrame>
      <View style={[block, { height: 20 }]} />
      <View style={[block, { height: 14 }]} />
      <View style={[block, { flex: 1 }]} />
    </ThumbnailFrame>
  );
}

/** 金环（首页预设）：一张卡片里一个环，底下通栏几行 */
export function RingThumbnail() {
  const theme = useTheme();
  const line = { height: 4, borderRadius: 2, backgroundColor: theme.backgroundSelected };
  return (
    <ThumbnailFrame>
      <View style={[frameStyles.ringCard, { backgroundColor: theme.backgroundSelected }]}>
        <View
          style={[
            frameStyles.ring,
            { borderColor: theme.background, borderTopColor: theme.cardHighlight, borderRightColor: theme.cardHighlight },
          ]}
        />
      </View>
      <View style={[line, { width: '85%' }]} />
      <View style={[line, { width: '70%' }]} />
      <View style={[line, { width: '80%' }]} />
    </ThumbnailFrame>
  );
}

const frameStyles = StyleSheet.create({
  ringCard: {
    height: 34,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 4,
  },
});

const styles = StyleSheet.create({
  line: {
    height: 3,
    borderRadius: 1.5,
  },
  bigLine: {
    height: 7,
    borderRadius: 2,
  },
  track: {
    height: 5,
    borderRadius: 2.5,
  },
  fill: {
    height: 5,
    borderRadius: 2.5,
  },
  tick: {
    position: 'absolute',
    top: -2,
    width: 1.5,
    height: 9,
  },
  ringCard: {
    flex: 1,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  ring: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 4,
  },
  pill: {
    width: '70%',
    height: 6,
    borderRadius: 3,
  },
  flatGroup: {
    flex: 1,
    gap: 3,
  },
});
