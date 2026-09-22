import { Pressable, StyleSheet, View } from 'react-native';

import { CategoryIcon } from '@/components/category/category-icon';
import { ThemedText } from '@/components/ui/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { formatSignedAmount } from '@/utils/format';

export type TransactionListItemData = {
  id: string;
  /** 原样传库里 categories.icon 的值：emoji / builtin:key / file:// 都由 CategoryIcon 认 */
  icon: string | null;
  /** 主题（"为了什么事"）。用户没填时录入那边会拿店名或分类名顶上，所以它不会是空的 */
  title: string;
  /** 「餐饮 · 早餐」，由 formatCategoryPath 拼好再传进来 */
  categoryLabel: string;
  time: string;
  /** 备注（"具体买了啥"）。跟主题同一行显示，中间一个分隔点 */
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

// 单条交易行：首页两套布局、日历页的当天明细、分类下钻页都复用这一个组件，
// 只是喂给它的数据和底色不同。
//
// 三行：「餐饮 · 早餐」/「04:55」/「吃早餐 · 3个汉堡」。
// 分类路径在最上面而不是主题，是因为主题在这个 App 里可以不填——不填时录入那边
// 会拿店名或分类名顶上，于是原来的排版（主题在上、分类在下）会出现
// 「餐饮 / 早餐 · 04:45」这种上下两行说同一件事的行。
// 分类是每笔账都一定有的，拿它当主行，行与行之间才是齐的；
// 主题掉到第三行跟备注并排——那两个字段回答的都是"这一笔具体是什么"。
//
// 金额一律用正文色，收入也不再染绿。
// 原来的说法是"支出占九成，全标红等于整屏都在报警，红绿留给收入这种例外"——
// 前半句依然成立，但把例外单独染色带来的是另一个问题：一屏账单里零星几行绿字，
// 眼睛会先被它们抓走，而它们恰恰是最不需要盯着看的那几笔。
// 现在是进是出由 +/- 号说，颜色不再兼职当标签（当天小计那排的"收/支"也是同一个思路）。
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
  // 主题没填时录入那边拿分类名顶上了，于是第一行「餐饮 · 早餐」和底下那行「餐饮」会重复一遍。
  // 路径里的**每一段**都要算重复，不能只比整条路径和叶子：
  // 分类是子分类「早餐」时，顶上去的可能是父分类名「餐饮」，只比叶子就漏掉了
  const titleIsEcho = categoryLabel.split(' · ').concat(categoryLabel).includes(title);
  const detail = [titleIsEcho ? null : title, note].filter(Boolean).join(' · ');
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
        <ThemedText style={[styles.title, onPage && styles.titleOnPage]}>{categoryLabel}</ThemedText>

        <ThemedText themeColor="textSecondary" style={styles.meta}>
          {time}
        </ThemedText>
        {detail ? (
          <ThemedText themeColor="textSecondary" style={styles.detail} numberOfLines={2}>
            {detail}
          </ThemedText>
        ) : null}
      </View>

      <ThemedText style={styles.amount}>{formatSignedAmount(amount, type)}</ThemedText>
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
  // 比时间大半号：这是"这笔到底是什么"，比几点钟更值得看
  detail: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  amount: {
    paddingTop: 5,
    alignSelf: 'flex-start',
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '600',
  },
});
