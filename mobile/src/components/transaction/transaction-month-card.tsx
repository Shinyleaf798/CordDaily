import { Pressable, StyleSheet, View } from 'react-native';

import { TransactionListItem } from '@/components/transaction/transaction-list-item';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { useTheme } from '@/hooks/use-theme';
import type { TransactionMonthGroup } from '@/utils/transaction-view';

type TransactionMonthCardProps = {
  group: TransactionMonthGroup;
  onSelect: (id: string) => void;
};

/** 日期那一列的宽度。固定值而不是让内容自己撑：两位数的 30 和一位数的 4 要左边对齐 */
const DAY_GUTTER_WIDTH = 32;
const CARD_PADDING = 16;
const ICON_WIDTH = 38;
const COLUMN_GAP = 12;

/**
 * 「一个月 = 一张卡」。**只有搜索结果用这个形状。**
 *
 * 跟 TransactionDayCard 的区别不只是粒度，是**日期摆在哪**：
 * 按天分卡时日期是卡顶上那条带子（还带当天小计），一张卡里所有行共享它；
 * 按月分卡时同一张卡里的行来自不同的日子，日期只能跟着行走，所以挪到每行最左边。
 *
 * 为什么搜索要另一套：搜「鸣潮」出来的 8 笔横跨 2024–2026，彼此隔着好几个月。
 * 按天分就是 8 张各含一行的卡，每张顶上挂一条"当天小计"——而那个小计等于那一行本身，
 * 是个永远在重复的数。按月之后标题自带年份，跨年的两笔再也不会看起来一模一样。
 *
 * **没有月度小计。** 搜索页顶上那张汇总卡报的是"这次搜索一共多少钱"，
 * 那才是用户搜完想知道的数；每个月再报一次，会让人以为要把它们加起来对一遍。
 */
export function TransactionMonthCard({ group, onSelect }: TransactionMonthCardProps) {
  const theme = useTheme();

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      {group.items.map((item, index) => (
        <View key={item.id}>
          {index > 0 ? <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} /> : null}
          {/* 整行可点，包括左边那列日期——日期是这一行的一部分，不是旁边的装饰。
              行内不再给 TransactionListItem 传 onPress，否则日期那一列会变成行里唯一点不动的地方 */}
          <Pressable onPress={() => onSelect(item.id)} style={styles.row}>
            <View style={styles.dayGutter}>
              <ThemedText style={styles.dayNumber}>{item.date.getDate()}</ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.dayMonth}>
                {item.date.getMonth() + 1}月
              </ThemedText>
            </View>
            <View style={styles.itemFill}>
              <TransactionListItem {...item} surface="card" />
            </View>
          </Pressable>
        </View>
      ))}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  // 不收圆角。按天分卡时圆角是必要的——那种卡一天一张、一屏好几个，
  // 圆角是"这是一块"的边界信号。按月之后一屏常常只有一两张，边界靠分节标题和间距就说清楚了，
  // 再加圆角只会让列表看起来被切成一段一段的
  card: {},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: COLUMN_GAP,
    paddingHorizontal: CARD_PADDING,
    paddingVertical: 7,
  },
  // 顶对齐而不是居中：行的高度由右边的内容决定（有备注的行比没备注的高两行），
  // 居中的话日期会在长行里飘到中间，一列日期就不齐了
  dayGutter: {
    width: DAY_GUTTER_WIDTH,
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingTop: 4,
  },
  dayNumber: {
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '700',
  },
  dayMonth: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
  },
  itemFill: {
    flex: 1,
  },
  // 跟 TransactionDayBlock 同一条规矩：分隔线从**文字**开始，不切过图标。
  // 这里多了一列日期，所以缩进也多一段：16 内距 + 32 日期 + 12 + 38 图标 + 12
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: CARD_PADDING + DAY_GUTTER_WIDTH + COLUMN_GAP + ICON_WIDTH + COLUMN_GAP,
  },
});
