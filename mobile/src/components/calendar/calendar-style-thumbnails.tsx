import type { ComponentType } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThumbnailFrame } from '@/components/ui/page-style-sheet';
import type { CalendarLayoutName, CalendarSlot } from '@/constants/calendar-layout';
import { useTheme } from '@/hooks/use-theme';

/**
 * 日历「编辑」弹层里的缩略图：第一层两个整页预设，第二层上半、下半各两种。
 * 跟首页的缩略图同一个外框（ThumbnailFrame），只画骨架
 */
export const CalendarPresetThumbnails: Record<CalendarLayoutName, ComponentType> = {
  classic: ClassicPageThumbnail,
  heat: HeatPageThumbnail,
};

export const CalendarSlotThumbnails: Record<CalendarSlot, Record<CalendarLayoutName, ComponentType>> = {
  top: { classic: ClassicTopThumbnail, heat: HeatTopThumbnail },
  day: { classic: ClassicDayThumbnail, heat: HeatDayThumbnail },
};

// 一排排小方格的深浅，固定写死：缩略图要的是"有深有浅"这个印象，不是真数据
const HEAT_PATTERN = [0, 2, 1, 3, 0, 1, 2, 1, 3, 2, 0, 1, 2, 4, 1, 0, 2, 3, 1, 2, 1];
const HEAT_ALPHA = ['', '33', '59', '8c', 'cc'];

function MiniGrid({ heat, rows = 3 }: { heat: boolean; rows?: number }) {
  const theme = useTheme();
  return (
    <View style={styles.grid}>
      {Array.from({ length: rows }, (_, row) => (
        <View key={row} style={styles.gridRow}>
          {HEAT_PATTERN.slice(row * 7, row * 7 + 7).map((level, col) => (
            <View
              key={col}
              style={[
                styles.gridCell,
                {
                  backgroundColor: heat
                    ? level > 0
                      ? theme.cardHighlight + HEAT_ALPHA[level]
                      : theme.backgroundElement
                    : theme.background,
                },
              ]}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

/** 经典整页：一张总览卡 + 一张月历卡 + 一张当天卡 */
function ClassicPageThumbnail() {
  const theme = useTheme();
  const card = { backgroundColor: theme.backgroundSelected, borderRadius: 4, padding: 3 };
  return (
    <ThumbnailFrame>
      <View style={[card, { height: 12 }]} />
      <View style={card}>
        <MiniGrid heat={false} />
      </View>
      <View style={[card, { flex: 1 }]} />
    </ThumbnailFrame>
  );
}

/** 热力整页：没有卡片，一行数字 + 热力格 + 一条细线下的几行 */
function HeatPageThumbnail() {
  const theme = useTheme();
  return (
    <ThumbnailFrame>
      <View style={[styles.line, { width: '70%', backgroundColor: theme.text }]} />
      <MiniGrid heat />
      <View style={[styles.rule, { backgroundColor: theme.textSecondary }]} />
      <View style={[styles.line, { width: '85%', backgroundColor: theme.textSecondary }]} />
      <View style={[styles.line, { width: '65%', backgroundColor: theme.textSecondary }]} />
    </ThumbnailFrame>
  );
}

/** 上半 · 经典：总览卡（一个大数）+ 月历卡 */
function ClassicTopThumbnail() {
  const theme = useTheme();
  const card = { backgroundColor: theme.backgroundSelected, borderRadius: 4, padding: 3, gap: 3 };
  return (
    <ThumbnailFrame>
      <View style={card}>
        <View style={[styles.bigLine, { width: '65%', backgroundColor: theme.text }]} />
      </View>
      <View style={[card, { flex: 1 }]}>
        <MiniGrid heat={false} rows={3} />
      </View>
    </ThumbnailFrame>
  );
}

/** 上半 · 热力：三个数并排 + 一整块热力格 */
function HeatTopThumbnail() {
  const theme = useTheme();
  return (
    <ThumbnailFrame>
      <View style={styles.statRow}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.stat, { backgroundColor: i === 1 ? theme.income : theme.text }]} />
        ))}
      </View>
      <MiniGrid heat rows={3} />
    </ThumbnailFrame>
  );
}

/** 下半 · 经典：一张卡，卡顶是那天，卡里几笔 */
function ClassicDayThumbnail() {
  const theme = useTheme();
  const row = [styles.line, { backgroundColor: theme.textSecondary }];
  return (
    <ThumbnailFrame>
      <View style={[styles.dayCard, { backgroundColor: theme.backgroundSelected }]}>
        <View style={[styles.line, { width: '45%', backgroundColor: theme.cardHighlight }]} />
        <View style={[...row, { width: '85%' }]} />
        <View style={[...row, { width: '70%' }]} />
        <View style={[...row, { width: '80%' }]} />
      </View>
    </ThumbnailFrame>
  );
}

/** 下半 · 热力：一条细线下面直接几行，不要卡片 */
function HeatDayThumbnail() {
  const theme = useTheme();
  const row = [styles.line, { backgroundColor: theme.textSecondary }];
  return (
    <ThumbnailFrame>
      <View style={[styles.rule, { backgroundColor: theme.textSecondary }]} />
      <View style={[styles.line, { width: '45%', backgroundColor: theme.cardHighlight }]} />
      <View style={[...row, { width: '85%' }]} />
      <View style={[...row, { width: '70%' }]} />
      <View style={[...row, { width: '80%' }]} />
    </ThumbnailFrame>
  );
}

const styles = StyleSheet.create({
  grid: {
    gap: 1.5,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 1.5,
  },
  gridCell: {
    flex: 1,
    height: 4.5,
    borderRadius: 1,
  },
  line: {
    height: 3,
    borderRadius: 1.5,
  },
  bigLine: {
    height: 6,
    borderRadius: 2,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
  },
  statRow: {
    flexDirection: 'row',
    gap: 3,
  },
  stat: {
    flex: 1,
    height: 5,
    borderRadius: 2,
  },
  dayCard: {
    flex: 1,
    borderRadius: 4,
    padding: 4,
    gap: 4,
  },
});
