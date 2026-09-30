import { StyleSheet, View } from 'react-native';

import { BillsSectionTitle } from '@/components/home/bills-section-title';
import { TransactionDayCard } from '@/components/transaction/transaction-day-card';
import { ThemedText } from '@/components/ui/themed-text';
import { ScreenGap } from '@/constants/theme';
import type { HomeBillsProps } from '@/components/home/layouts/types';

// 下半「节奏条」：一天一张卡。
export function PaceBills({ data, onSelectTransaction }: HomeBillsProps) {
  return (
    <View style={styles.wrap}>
      <BillsSectionTitle />

      {data.dayGroups.length === 0 ? (
        <ThemedText type="default" themeColor="textSecondary">
          最近还没有账单，点底部的 + 记一笔吧。
        </ThemedText>
      ) : (
        <View style={styles.dayGroups}>
          {/* 一天一张卡，而不是一整块列表里插分隔线：天与天之间的界线靠卡片间距交代，
              卡内的交易之间才用细线，层级比"全是同一种线"清楚（那张卡本身见 TransactionDayCard） */}
          {data.dayGroups.map((group) => (
            <TransactionDayCard key={group.key} group={group} onSelect={onSelectTransaction} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: ScreenGap,
  },
  // 卡片之间比 ScreenGap 再紧一点：它们是同一段账，不该跟"标题和列表"隔得一样开
  dayGroups: {
    gap: 10,
  },
});
