import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { useTheme } from '@/hooks/use-theme';

type MonthChipProps = {
  label: string;
};

/**
 * 首页顶部那枚月份标记。两套布局共用一份。
 *
 * 之前节奏条用的是这个 chip、圆环用的是一行金色小字（13px、字距 2），
 * 两边说的是同一件事——"你正在看哪个月"——却长成两个样子，
 * 在「我的 → 首页布局」里切换时，这行字会变形。
 *
 * 留下 chip 而不是那行小字：首页是唯一没有翻月控件的页面（日历和统计的月份在各自的
 * 翻月卡片里），所以这里的月份是个**状态标记**，不是标题的一部分。
 * 有底色的 chip 能把这层意思说出来，一行小字会被读成副标题。
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
