import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import type { BillSummaryRow } from '@/hooks/use-bill-overview-data';
import { useTheme } from '@/hooks/use-theme';
import { formatCurrency } from '@/utils/format';

type BillSummaryTableProps = {
  /** 总账单汇总 / 年账单汇总 / 月账单汇总 / 周账单汇总 */
  title: string;
  rows: BillSummaryRow[];
};

/**
 * 账单汇总：一段时间拆成下一级的若干段，每段一行收入/支出/结余。
 *
 * 这是这一页唯一一张**表**。总览卡回答"一共多少"、趋势图回答"什么形状"，这张表回答
 * "具体分布在哪里"——「2024 年花得比 2025 年多 108 块」这种事只有把数字排成列才读得出来。
 *
 * **列与列之间有竖线**，行与行之间没有。这是参考界面的做法，也是对的：
 * 四列数字如果只靠间距分开，窄屏上「12,107.70」和「-5,197.66」会看起来像同一个数的两半；
 * 而行与行本来就靠换行分开了，再画横线只会让整块变成一张网格纸。
 *
 * 第一列表头写「日期」不写「年/月/日」：行里已经写着「2026年」「9月」了，
 * 表头再报一次粒度是重复的；而「日期」在四档粒度下都成立。
 *
 * 「总计」和「年均」在最上面并且垫一层淡色：它们是对下面那些行的概括，不是同一种东西。
 * 混在明细行里按时间排的话，读表的人得先找一遍哪行是合计。
 *
 * 一行都没有（这一段没记过账）时整张表不画，由调用方判断——一张只有表头的空表
 * 比没有表更难懂。
 */
export function BillSummaryTable({ title, rows }: BillSummaryTableProps) {
  const theme = useTheme();
  const columnBorder = { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: theme.backgroundSelected };

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.titleRow}>
        <Ionicons name="server" size={15} color={theme.text} />
        <ThemedText style={styles.cardTitle}>{title}</ThemedText>
      </View>

      <View style={[styles.head, { borderBottomColor: theme.backgroundSelected }]}>
        <ThemedText themeColor="textSecondary" style={[styles.cell, styles.labelCell, styles.headText]}>
          日期
        </ThemedText>
        {['收入', '支出', '结余'].map((label) => (
          <ThemedText key={label} themeColor="textSecondary" style={[styles.cell, styles.headText, columnBorder]}>
            {label}
          </ThemedText>
        ))}
      </View>

      {rows.map((row) => (
        <View
          key={row.key}
          style={[
            styles.row,
            // 概括行垫一层极淡的强调色（同色系 + 低透明度，三套主题都成立），
            // 不用加粗来区分：一张表里加粗的行多了反而没有轻重
            row.isSummary ? { backgroundColor: theme.cardHighlight + '12' } : null,
          ]}>
          <ThemedText numberOfLines={1} style={[styles.cell, styles.labelCell, styles.rowLabel]}>
            {row.label}
          </ThemedText>
          <ThemedText numberOfLines={1} style={[styles.cell, styles.rowValue, columnBorder]}>
            {formatCurrency(row.income)}
          </ThemedText>
          <ThemedText numberOfLines={1} style={[styles.cell, styles.rowValue, columnBorder]}>
            {formatCurrency(row.expense)}
          </ThemedText>
          <ThemedText
            numberOfLines={1}
            style={[
              styles.cell,
              styles.rowValue,
              columnBorder,
              { color: row.balance < 0 ? theme.expense : theme.text },
            ]}>
            {formatCurrency(row.balance)}
          </ThemedText>
        </View>
      ))}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    paddingVertical: 16,
    // 行与行之间不留 gap：有底色的那两行（总计/均值）要连成一块，
    // 中间夹一条缝会让它们看起来像两个不相干的东西。行距由 row 自己的 paddingVertical 给
    overflow: 'hidden',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  head: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  // 三列数字等宽居中，日期列稍窄——「2026年」比「-RM12,107.70」短得多。
  // 居中而不是右对齐：竖线已经把列分开了，右对齐会让数字全都贴在竖线上
  cell: {
    flex: 1,
    minWidth: 0,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  labelCell: {
    flex: 0.72,
  },
  headText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  rowLabel: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  // 四列挤在一屏里，金额得压到 11——「-RM12,107.70」在 13 号字下要 78pt，
  // 而一列只有 ~76pt。带着 RM 是有意的：参考界面每一格都带，一眼看过去知道这是钱不是笔数
  rowValue: {
    fontSize: 11,
    lineHeight: 17,
    fontWeight: '600',
  },
});
