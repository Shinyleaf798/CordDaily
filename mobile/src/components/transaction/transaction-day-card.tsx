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
 * 「一天 = 一张卡」。分类下钻页、搜索结果、账单预览用的是这个形状：
 * 那几个页面里一天和一天之间没有别的东西，卡片间距就是它们的分界线。
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
