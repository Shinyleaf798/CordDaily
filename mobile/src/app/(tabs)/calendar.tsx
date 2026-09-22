import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CalendarDayDetail } from '@/components/calendar/calendar-day-detail';
import { CalendarMonthGrid } from '@/components/calendar/calendar-month-grid';
import { CalendarSummaryHeader } from '@/components/calendar/calendar-summary-header';
import { TransactionDetailSheet } from '@/components/transaction/transaction-detail-sheet';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useCalendarViewData } from '@/hooks/use-calendar-view-data';
import { useTheme } from '@/hooks/use-theme';
import { formatDayKey } from '@/utils/date';

/** 月份只认年和月，日子统一落在 1 号，避免 31 号往前翻掉进"2 月 31 日"这种坑 */
function monthOf(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function shiftMonth(month: Date, delta: number) {
  return new Date(month.getFullYear(), month.getMonth() + delta, 1);
}

/**
 * 消费日历：上面月历（每格显示当天消费），点一天在**同一页**下面展开当天明细。
 *
 * 为什么不跳"某天的账单"独立页：日历的用处是横着比较——今天点一下看完，顺手点旁边那天比一比。
 * 每次都跳页再退回来，来回四次点击才能比两天，日历就退化成一个花哨的日期选择器了。
 *
 * 页面自己只管三件事：看哪个月、选了哪天、点开了哪笔。数字全在 useCalendarViewData 里算。
 */
export default function CalendarScreen() {
  const theme = useTheme();

  const [month, setMonth] = useState(() => monthOf(new Date()));
  // 进来先选中今天：不预选的话下半屏一开始是空的，还得教用户"点一下日期"。
  // 存 key 而不是 Date：Date 对象每次渲染都是新的引用，拿来做选中比较要么写 isSameDay 要么出 bug
  const [selectedKey, setSelectedKey] = useState<string | null>(() => formatDayKey(new Date()));
  const [detailId, setDetailId] = useState<string | null>(null);

  const data = useCalendarViewData(month, selectedKey);

  // 每次渲染重算，不用 useMemo：跨过零点（乃至跨月）回到 App 时"本月"得跟着变
  const isCurrentMonth = month.getTime() === monthOf(new Date()).getTime();

  // 翻月时清掉选中：选中的是上个月的某天，留着它下面那张明细卡会跟日历对不上
  // （buildCalendarViewData 也会把跨月的 selection 判成 null，这里清掉是让状态本身也别留脏值）
  const goToMonth = (next: Date) => {
    setMonth(next);
    setSelectedKey(null);
  };

  const backToCurrentMonth = () => {
    const now = new Date();
    setMonth(monthOf(now));
    setSelectedKey(formatDayKey(now));
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="pageTitle">日历</ThemedText>

        <CalendarSummaryHeader
          monthLabel={data.monthLabel}
          monthExpense={data.monthExpense}
          monthIncome={data.monthIncome}
          dailyAverage={data.dailyAverage}
          dailyAverageHint={data.dailyAverageHint}
          onPrevMonth={() => goToMonth(shiftMonth(month, -1))}
          onNextMonth={() => goToMonth(shiftMonth(month, 1))}
          onBackToCurrentMonth={isCurrentMonth ? undefined : backToCurrentMonth}
        />

        <CalendarMonthGrid
          weeks={data.weeks}
          maxDayExpense={data.maxDayExpense}
          selectedKey={data.selection?.key ?? null}
          onSelectDay={(key) => setSelectedKey((current) => (current === key ? null : key))}
        />

        {data.selection ? (
          <CalendarDayDetail selection={data.selection} onSelectTransaction={setDetailId} />
        ) : (
          <View style={styles.hint}>
            <ThemedText themeColor="textSecondary" style={styles.hintText}>
              点一天查看当天账单
            </ThemedText>
          </View>
        )}
      </ScrollView>

      {/* 点明细里的某一笔，弹的是全 App 同一个详情层（编辑/复制/删除都在里面），
          删完 invalidateAll 会把本月查询一起刷掉，日历格子跟着变 */}
      {detailId ? <TransactionDetailSheet transactionId={detailId} onDismiss={() => setDetailId(null)} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.three,
    paddingTop: 12,
    paddingBottom: Spacing.six,
    gap: 12,
  },
  hint: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  hintText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
});
