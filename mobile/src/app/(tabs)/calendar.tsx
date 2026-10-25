import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CalendarStyleOptions } from '@/components/calendar/calendar-style-options';
import { CalendarPresetThumbnails } from '@/components/calendar/calendar-style-thumbnails';
import { ClassicDay } from '@/components/calendar/layouts/classic-day';
import { ClassicTop } from '@/components/calendar/layouts/classic-top';
import { HeatDay } from '@/components/calendar/layouts/heat-day';
import { HeatTop } from '@/components/calendar/layouts/heat-top';
import { TransactionDetailSheet } from '@/components/transaction/transaction-detail-sheet';
import { PageEditButton } from '@/components/ui/page-edit-button';
import { PageStyleSheet, type StyleChoice } from '@/components/ui/page-style-sheet';
import {
  CalendarLayoutLabels,
  CalendarLayoutNames,
  CalendarPresetHints,
  type CalendarLayoutName,
} from '@/constants/calendar-layout';
import { ScreenGap, ScreenPadding } from '@/constants/theme';
import { useCalendarViewData } from '@/hooks/use-calendar-view-data';
import { useTheme } from '@/hooks/use-theme';
import { useCalendarStore } from '@/store/calendar.store';
import { formatDayKey, shiftMonth, startOfMonth } from '@/utils/date';

const PRESETS: StyleChoice<CalendarLayoutName>[] = CalendarLayoutNames.map((name) => ({
  key: name,
  label: CalendarLayoutLabels[name],
  hint: CalendarPresetHints[name],
  Thumbnail: CalendarPresetThumbnails[name],
}));

/**
 * 消费日历：上面月历（每格显示当天消费），点一天在**同一页**下面展开当天明细。
 *
 * 为什么不跳"某天的账单"独立页：日历的用处是横着比较——今天点一下看完，顺手点旁边那天比一比。
 * 每次都跳页再退回来，来回四次点击才能比两天，日历就退化成一个花哨的日期选择器了。
 *
 * 页面自己只管三件事：看哪个月、选了哪天、点开了哪笔。数字全在 useCalendarViewData 里算。
 *
 * 上下两段各自按用户选的画法分发（经典 / 热力，见 constants/calendar-layout），跟首页同一套：
 * 看哪个月、选了哪天留在这一层，换画法时不会被重置。
 */
export default function CalendarScreen() {
  const theme = useTheme();

  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  // 进来先选中今天：不预选的话下半屏一开始是空的，还得教用户"点一下日期"。
  // 存 key 而不是 Date：Date 对象每次渲染都是新的引用，拿来做选中比较要么写 isSameDay 要么出 bug
  const [selectedKey, setSelectedKey] = useState<string | null>(() => formatDayKey(new Date()));
  const [detailId, setDetailId] = useState<string | null>(null);
  const [isEditingStyle, setEditingStyle] = useState(false);
  const layout = useCalendarStore();

  const data = useCalendarViewData(month, selectedKey);

  // 每次渲染重算，不用 useMemo：跨过零点（乃至跨月）回到 App 时"本月"得跟着变
  const isCurrentMonth = month.getTime() === startOfMonth(new Date()).getTime();

  // 翻月时清掉选中：选中的是上个月的某天，留着它下面那张明细卡会跟日历对不上
  // （buildCalendarViewData 也会把跨月的 selection 判成 null，这里清掉是让状态本身也别留脏值）
  const goToMonth = (next: Date) => {
    setMonth(next);
    setSelectedKey(null);
  };

  const backToCurrentMonth = () => {
    const now = new Date();
    setMonth(startOfMonth(now));
    setSelectedKey(formatDayKey(now));
  };

  const topProps = {
    data,
    month,
    selectedKey: data.selection?.key ?? null,
    onSelectDay: (key: string) => setSelectedKey((current) => (current === key ? null : key)),
    onPrevMonth: () => goToMonth(shiftMonth(month, -1)),
    onNextMonth: () => goToMonth(shiftMonth(month, 1)),
    onBackToCurrentMonth: isCurrentMonth ? undefined : backToCurrentMonth,
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'left', 'right']}>
      {/* 没有标题行：底部 tab 已经亮着「日历」，月份和左右翻页都在下面那张卡的第一行，标题条只是重复，拿掉后第一屏多出一截 */}

      <ScrollView contentContainerStyle={styles.content}>
        {layout.top === 'heat' ? <HeatTop {...topProps} /> : <ClassicTop {...topProps} />}

        {layout.day === 'heat' ? (
          <HeatDay selection={data.selection} onSelectTransaction={setDetailId} />
        ) : (
          <ClassicDay selection={data.selection} onSelectTransaction={setDetailId} />
        )}

        {/* 这一块同时就是底部留白，所以 content 里没有 paddingBottom（见 PageEditButton） */}
        <PageEditButton onPress={() => setEditingStyle(true)} />
      </ScrollView>

      {/* 点明细里的某一笔，弹的是全 App 同一个详情层（编辑/复制/删除都在里面），
          删完 invalidateAll 会把本月查询一起刷掉，日历格子跟着变 */}
      {detailId ? <TransactionDetailSheet transactionId={detailId} onDismiss={() => setDetailId(null)} /> : null}

      {isEditingStyle ? (
        <PageStyleSheet
          title="日历样式"
          choices={PRESETS}
          // 两段选成一样才算是某个预设；拆开选的时候第一层哪个都不亮（同首页）
          selected={layout.top === layout.day ? layout.top : null}
          onSelect={(name) => {
            layout.setSlot('top', name);
            layout.setSlot('day', name);
          }}
          options={<CalendarStyleOptions />}
          onDismiss={() => setEditingStyle(false)}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: ScreenPadding,
    paddingTop: ScreenGap,
    // 没有 paddingBottom：底部留白由最后那颗编辑按钮自己占（它的高度就是 ScreenBottomInset）
    gap: ScreenGap,
  },
});
