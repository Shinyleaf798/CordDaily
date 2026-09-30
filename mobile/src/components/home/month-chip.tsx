import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { useTheme } from '@/hooks/use-theme';

type MonthChipProps = {
  label: string;
};

/**
 * 首页顶部那枚月份标记。**现在只有金环布局（ring-layout）在用**。
 *
 * 曾经两套布局共用一份：那时节奏条用 chip、圆环用一行金色小字，说的是同一件事
 * （"你正在看哪个月"）却长成两个样子，切布局时这行字会变形，所以统一成了 chip。
 * 后来节奏条把月份并进了总览卡第一行（「2026年9月 · 本月支出」），那边就不再需要它——
 * 于是这个"两边长得一样"的约束也随之消失了，剩下的只是圆环布局自己的一个件。
 *
 * 留下 chip 而不是那行小字：首页是唯一没有翻月控件的页面（日历和统计的月份在各自的
 * 翻月卡片里），所以这里的月份是个**状态标记**，不是标题的一部分。
 * 有底色的 chip 能把这层意思说出来，一行小字会被读成副标题。
 *
 * 金环布局要是哪天也把月份收进某张卡，这个文件就可以整个删掉。
 *
 * 外面包一层 View 是为了 chip 只占自己那么宽——直接放进纵向容器里它会被拉满整行。
 */
export function MonthChip({ label }: MonthChipProps) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      <View style={[styles.chip, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText style={[styles.text, { color: theme.cardHighlight }]}>{label}</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
});
