import { Pressable, StyleSheet, View } from 'react-native';

import { CategoryIcon } from '@/components/category/category-icon';
import { ThemedText } from '@/components/ui/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { formatSignedAmount } from '@/utils/format';

export type TransactionListItemData = {
  id: string;
  /** 原样传库里 categories.icon 的值：emoji / builtin:key / file:// 都由 CategoryIcon 认 */
  icon: string | null;
  title: string;
  categoryLabel: string;
  time: string;
  note?: string;
  amount: number;
  type: 'INCOME' | 'EXPENSE';
};

type TransactionListItemProps = TransactionListItemData & {
  /**
   * 这一行铺在什么底色上，决定图标块用哪一级底色——图标块必须比它下面那层深一级才看得见。
   * 'card'：行在卡片（backgroundElement）里，图标用 backgroundSelected，方角圆片
   * 'page'：行直接铺在页面底色（background）上，图标用 backgroundElement，圆形
   */
  surface?: 'card' | 'page';
  /** 点这一行做什么。不传就是纯展示，连按下的反馈都没有 */
  onPress?: () => void;
};

// 单条交易行：两套首页布局和以后的日历/账户详情页都复用这一个组件，只是喂给它的数据和底色不同
//
// 支出金额用普通文字色而不是红色：账本里九成以上是支出，全标红等于整屏都在报警，
// 反而看不出哪条值得注意。红/绿留给"当天小计"和收入这种真正的例外。
export function TransactionListItem({
  icon,
  title,
  categoryLabel,
  time,
  note,
  amount,
  type,
  surface = 'card',
  onPress,
}: TransactionListItemProps) {
  const theme = useTheme();
  const onPage = surface === 'page';

  // 不可点时退回 View，而不是给 Pressable 传 disabled：
  // disabled 的 Pressable 仍然会吃掉触摸事件，外面包着的可滚动区域会跟着变迟钝
  const Row = onPress ? Pressable : View;

  return (
    <Row style={styles.row} onPress={onPress}>
      <View
        style={[
          styles.iconWrap,
          onPage
            ? { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.backgroundElement }
            : { width: 38, height: 38, borderRadius: 12, backgroundColor: theme.backgroundSelected },
        ]}>
        <CategoryIcon icon={icon} size={19} />
      </View>

      <View style={styles.middle}>
        <ThemedText style={[styles.title, onPage && styles.titleOnPage]}>{title}</ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.meta}>
          {categoryLabel} · {time}
          {note ? ` · ${note}` : ''}
        </ThemedText>
      </View>

      <ThemedText style={[styles.amount, type === 'INCOME' && { color: theme.income }]}>
        {formatSignedAmount(amount, type)}
      </ThemedText>
    </Row>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  middle: {
    flex: 1,
    gap: 1,
  },
  title: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
  },
  // 铺在页面底色上时没有卡片帮忙托住，标题压到 500 让整屏不那么吵
  titleOnPage: {
    fontWeight: '500',
  },
  meta: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  amount: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
  },
});
