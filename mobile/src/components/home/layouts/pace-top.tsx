import { StyleSheet, View } from 'react-native';

import { BudgetProgressCard } from '@/components/home/budget-progress-card';
import { MonthSummaryCard } from '@/components/home/month-summary-card';
import { ScreenGap } from '@/constants/theme';
import type { HomeTopProps } from '@/components/home/layouts/types';

// 上半「节奏条」：月度总览卡 + 预算节奏卡。
// 全部信息都装在卡片里，层次靠卡片边界交代，是两种画法里更稳、更耐看的那个。
export function PaceTop({ data }: HomeTopProps) {
  return (
    <View style={styles.wrap}>
      {/* 月份不再是标题下面单独一枚 chip，并进了总览卡第一行（见 MonthSummaryCard 顶上那条） */}
      <MonthSummaryCard
        monthLabel={data.monthLabel}
        income={data.income}
        expense={data.expense}
        balance={data.balance}
      />
      <BudgetProgressCard {...data} />
    </View>
  );
}

const styles = StyleSheet.create({
  // 自己管内部的间距，跟首页容器的 gap 取同一个数：
  // 这一段和下半之间、这一段里两张卡之间，节奏该是一样的
  wrap: {
    gap: ScreenGap,
  },
});
