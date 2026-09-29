import { Pressable, StyleSheet, View } from 'react-native';

import { CategoryIcon } from '@/components/category/category-icon';
import { ThemedText } from '@/components/ui/themed-text';
import { BASE_CURRENCY } from '@/constants/currencies';
import { formatCurrency, formatSignedMoney } from '@/utils/format';

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
  /** 录入时那个数——外币账单里它是外币金额（500 日元就是 500） */
  amount: number;
  /** 这笔账用的是哪种钱。本位币（MYR）时下面那行折算不显示 */
  currency: string;
  /** 折算成本位币之后的金额。统计、预算、当天小计用的都是它 */
  amountInBase: number;
  type: 'INCOME' | 'EXPENSE';
};

type TransactionListItemProps = TransactionListItemData & {
  /**
   * 这一行铺在什么底色上。图标不再垫底圈之后，它只剩一个作用：
   * 'page'（直接铺在页面底色上、没有卡片托着）时把标题压到 500，让整屏不那么吵。
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
  currency,
  amountInBase,
  type,
  surface = 'card',
  onPress,
}: TransactionListItemProps) {
  // 主题没填时录入那边拿分类名顶上了，于是第一行「餐饮 · 早餐」和底下那行「餐饮」会重复一遍。
  // 路径里的**每一段**都要算重复，不能只比整条路径和叶子：
  // 分类是子分类「早餐」时，顶上去的可能是父分类名「餐饮」，只比叶子就漏掉了
  const titleIsEcho = categoryLabel.split(' · ').concat(categoryLabel).includes(title);
  const detail = [titleIsEcho ? null : title, note].filter(Boolean).join(' · ');
  const onPage = surface === 'page';
  const isForeign = currency !== BASE_CURRENCY;

  // 不可点时退回 View，而不是给 Pressable 传 disabled：
  // disabled 的 Pressable 仍然会吃掉触摸事件，外面包着的可滚动区域会跟着变迟钝
  const Row = onPress ? Pressable : View;

  return (
    <Row style={styles.row} onPress={onPress}>
      {/* 图标不垫底圈了，直接画在卡片上，尺寸放到 28——
          底圈原本是为了把图标从底色里托出来，但分类图标本身（emoji 或彩色小图）
          已经够显眼，多一层灰圈只是把它框小了 */}
      <View style={styles.iconWrap}>
        <CategoryIcon icon={icon} size={28} />
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

      {/* 外币账单是两行：上面是**收据上那个数**（J¥500），下面小字是它在这个账本里算多少（RM12.98）。
          顺序不能反——用户核对的是收据，那个数要在第一眼的位置；
          折算值是账本的事，它只需要在想起来的时候找得到。
          本位币的账单只有一行，`isForeign` 为假时下面那行整个不渲染，行高跟以前一模一样 */}
      <View style={styles.amountColumn}>
        <ThemedText style={styles.amount}>{formatSignedMoney(amount, currency, type)}</ThemedText>
        {isForeign ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.amountInBase}>
            {formatCurrency(amountInBase)}
          </ThemedText>
        ) : null}
      </View>
    </Row>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  // 固定宽度而不是让图标自己撑：一列账单的文字才会左边对齐，
  // 不会因为某个 emoji 宽一点就整行往右挪
  iconWrap: {
    width: 38,
    height: 38,
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
  // 整列右对齐：两行数字长度不一样（J¥500 / RM12.98），左对齐会让下面那行吊在半空
  amountColumn: {
    paddingTop: 5,
    alignSelf: 'flex-start',
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '600',
  },
  amountInBase: {
    fontVariant: ['tabular-nums'],
  },
});
