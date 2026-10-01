import { StyleSheet } from 'react-native';

import { TransactionDayBlock } from '@/components/transaction/transaction-day-block';
import { ThemedView } from '@/components/ui/themed-view';
import { CardRadius } from '@/constants/theme';
import type { TransactionDayGroup } from '@/utils/transaction-view';

type TransactionDayCardProps = {
  group: TransactionDayGroup;
  onSelect: (id: string) => void;
};

/**
 * 「一天 = 一张卡」。分类下钻页和账单总览用的是这个形状：
 * 那两个页面里一天和一天之间没有别的东西，卡片间距就是它们的分界线。
 *
 * **搜索结果不用它**，用 TransactionMonthCard：那边的结果横跨好几年、彼此隔着好几个月，
 * 按天分会变成一堆各含一行的卡片（理由写在 TransactionMonthCard 上）。
 *
 * 排版本身在 TransactionDayBlock 里，这一层只负责那张卡（底色 + 圆角 + 裁切）。
 * 首页不用它——首页把好几天装进**同一张**大卡，那边直接用 Block（见 pace-bills）。
 */
export function TransactionDayCard({ group, onSelect }: TransactionDayCardProps) {
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <TransactionDayBlock group={group} onSelect={onSelect} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: CardRadius,
    overflow: 'hidden',
  },
});
