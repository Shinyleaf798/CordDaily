import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { formatCurrency } from '@/utils/format';

type BillSummaryCardProps = {
  expense: number;
  income: number;
  balance: number;
  count: number;
  dailyExpense: number;
  perEntryExpense: number;
  pendingReimbursement: number;
  settledReimbursement: number;
};

/**
 * 收支总览：上面三个主数（支出/收入/结余），下面三个辅助数。
 *
 * 排版照着参考界面：两排三列，第二排每格是「主标签 / 次标签」配「大数 + 小数」。
 * 参考界面第二排的三格是「优惠/退款」「未报销/已报销」「总笔数」——
 * 这个账本里没有优惠券也没有退款，那一格换成了**日均/笔均**（同样是一对互相说明的数），
 * 格子的形状和读法一模一样，只是问的问题换成了这本账答得上来的那个。
 * 编一个永远显示 RM0.00 的「优惠」出来，比换掉它更糟。
 *
 * 支出排在收入前面，跟首页的月度总览卡一致——这是一个记**消费**的账本，
 * 打开这一页想知道的第一件事是"花了多少"。
 *
 * 结余的颜色只有负数时才变（红），正数用强调色不用绿：
 * 绿色在这个 App 里是"收入"的意思，给结余也染绿会让两个不同的概念看起来是一回事。
 *
 * 这张卡**不受漏斗影响**：它就是"这一段时间的全貌"，按收支筛掉一半之后
 * 「结余」这一格会变成一个没有意义的数。筛选作用在下面的分类、标签和明细上。
 */
export function BillSummaryCard({
  expense,
  income,
  balance,
  count,
  dailyExpense,
  perEntryExpense,
  pendingReimbursement,
  settledReimbursement,
}: BillSummaryCardProps) {
  const theme = useTheme();

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.titleRow}>
        {/* 圆圈里一个货币符号。用描边圆 + 文字画，不找图标字体里的 ¥——
            这本账是 RM，图标字体里没有这个符号 */}
        <View style={[styles.badge, { borderColor: theme.text }]}>
          <ThemedText style={styles.badgeText}>RM</ThemedText>
        </View>
        <ThemedText style={styles.cardTitle}>收支总览</ThemedText>
      </View>

      <View style={styles.row}>
        <Cell label="支出" value={formatCurrency(expense)} />
        <Cell label="收入" value={formatCurrency(income)} />
        <Cell
          label="结余"
          value={formatCurrency(balance)}
          color={balance < 0 ? theme.expense : theme.cardHighlight}
        />
      </View>

      <View style={styles.row}>
        <Cell
          label="日均"
          subLabel="笔均"
          value={formatCurrency(dailyExpense)}
          subValue={formatCurrency(perEntryExpense)}
          compact
        />
        <Cell
          label="待收回"
          subLabel="已收回"
          value={formatCurrency(pendingReimbursement)}
          subValue={formatCurrency(settledReimbursement)}
          compact
        />
        <Cell label="总笔数" value={String(count)} compact />
      </View>
    </ThemedView>
  );
}

/**
 * 六个格子长得一样，就地定义一个小组件而不是抄六遍。
 * 不抽到 components/ 下面：它只有这张卡在用（CLAUDE.md 的归类规则：先看谁在用）。
 *
 * 第二排那种「A / B」的标签和「大数 / 小数」的值是**成对**出现的：
 * 上面那个标签配上面那个数，下面那个配下面那个。参考界面就是这么读的，
 * 所以次标签压暗、次值也压暗——两组灰度把这层对应关系说出来，不用画线。
 */
function Cell({
  label,
  subLabel,
  value,
  subValue,
  color,
  compact,
}: {
  label: string;
  subLabel?: string;
  value: string;
  subValue?: string;
  color?: string;
  compact?: boolean;
}) {
  const theme = useTheme();

  return (
    <View style={styles.cell}>
      <View style={styles.labelRow}>
        <ThemedText themeColor="textSecondary" style={styles.label}>
          {label}
        </ThemedText>
        {subLabel ? (
          <ThemedText themeColor="textSecondary" style={[styles.label, { opacity: 0.6 }]}>
            {` / ${subLabel}`}
          </ThemedText>
        ) : null}
      </View>

      <ThemedText
        numberOfLines={1}
        // 数字比标签大一档是这张卡的主结构：一眼扫过去先看到的是数，标签是解释
        style={[compact ? styles.valueCompact : styles.value, color ? { color } : null]}>
        {value}
      </ThemedText>

      {subValue ? (
        <ThemedText numberOfLines={1} style={[styles.subValue, { color: theme.textSecondary }]}>
          {subValue}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 16,
    gap: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  badge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '700',
  },
  cardTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 4,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  // 第一排三个主数。字号压到 19 是被最长的那个串逼的：
  // 「-RM12,107.70」十一个字符，三列均分一屏之后再大就换行了
  value: {
    fontSize: 19,
    lineHeight: 26,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  valueCompact: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subValue: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
});
