import { StyleSheet, View } from 'react-native';

import { BillsSectionTitle } from '@/components/home/bills-section-title';
import { TransactionDayBlock } from '@/components/transaction/transaction-day-block';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { CardRadius } from '@/constants/theme';
import type { HomeBillsProps } from '@/components/home/layouts/types';
import { useTheme } from '@/hooks/use-theme';

/**
 * 下半「节奏条」：**整段装在同一张大卡里**——标题行在最上面，底下一天接一天。
 *
 * 原来是一天一张卡、卡与卡之间留 10 的空。改成一张大卡是因为那个版本有两层边界在打架：
 * 每张卡自己有一圈轮廓，而天与天的分界线**本来就已经**由日期带（有底色的那条）画出来了。
 * 两套分隔说同一件事，读起来就是一堆框，而不是一段连续的账。
 *
 * 现在只剩一圈轮廓：这一整段是一块，里面的分层全交给日期带和细线。
 * 标题行也收进卡里，因为它说的就是这张卡装的是什么。
 */
export function PaceBills({ data, onSelectTransaction }: HomeBillsProps) {
  const theme = useTheme();
  const isEmpty = data.dayGroups.length === 0;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.titleRow}>
        <BillsSectionTitle title={data.billsTitle} />
      </View>

      {isEmpty ? (
        <View style={styles.empty}>
          <ThemedText type="default" themeColor="textSecondary">
            这一段还没有账单，点底部的 + 记一笔吧。
          </ThemedText>
        </View>
      ) : (
        data.dayGroups.map((group, index) => (
          <View key={group.key}>
            {/* 天与天之间加一条通栏细线：日期带自带底色已经能分开了，
                但两天的最后一行和下一天的带子挨在一起时，那条色差在深色主题下太弱 */}
            {index > 0 ? <View style={[styles.dayDivider, { backgroundColor: theme.background }]} /> : null}
            <TransactionDayBlock group={group} onSelect={onSelectTransaction} />
          </View>
        ))
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: CardRadius,
    overflow: 'hidden',
  },
  // 标题行的内距跟卡里每一行对齐（16），上下各留一点让它不贴着卡的上沿
  titleRow: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  empty: {
    paddingHorizontal: 16,
    paddingBottom: 18,
  },
  // 用页面底色而不是 backgroundSelected：它要读成"卡被切开了一道缝"，
  // 而不是"卡里多了一条分隔线"——后者跟一天之内那些细线是同一个语气，会分不出层级
  dayDivider: {
    height: StyleSheet.hairlineWidth,
  },
});
