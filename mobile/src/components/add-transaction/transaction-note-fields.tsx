import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { formatCurrency, splitMoney } from '@/utils/format';
import { useTheme } from '@/hooks/use-theme';
import type { SuggestionField } from '@/db/transactions';

/**
 * 某个字段的输入框**左上角**在整页里的坐标，补全浮层照它落位——
 * 浮层的左边缘对齐输入框的左边缘，下边缘坐在输入框那一行的顶边。
 *
 * x 是相对整页的：输入块这一路（bottomSheet → noteFields → container）横向都没有偏移，
 * 只有最里面那层 container 有内距，而 onLayout 报的 x 本来就含着父级的内距，
 * 所以直接量出来的数就能给外面用。
 */
export type FieldAnchor = { x: number; y: number };

/** 大金额那一行的字号。货币符号是嵌在里面的另一个 Text，得跟它一样大，所以提成常量 */
const AMOUNT_FONT_SIZE = 28;
const AMOUNT_LINE_HEIGHT = 34;

/** 店名和地点两列之间的间距，等同 styles.detailRow 的 gap。算地点那一列的 x 要用 */
const DETAIL_GAP = Spacing.two;

type TransactionNoteFieldsProps = {
  topic: string;
  onTopicChange: (value: string) => void;
  remark: string;
  onRemarkChange: (value: string) => void;
  merchant: string;
  onMerchantChange: (value: string) => void;
  location: string;
  onLocationChange: (value: string) => void;
  amount: number;
  /** 这笔账用的币种代码。点金额那一块就是换它 */
  currency: string;
  /** 折算成本位币是多少。本位币账单传 null，那一行不显示 */
  amountInBase: number | null;
  onCurrencyPress: () => void;
  /**
   * 哪个字段聚焦了（没有就是 null）。历史补全的浮层由**调用方**渲染，不在这里画：
   * 它要浮在这一整块的上方，而 Android 上画到父容器外面的东西收不到触摸，
   * 所以浮层必须挂在整页的根上。这里只负责报告"现在在填哪个字段"。
   */
  onFocusedFieldChange: (field: SuggestionField | null) => void;
  /**
   * 报告某个字段那一行的纵向位置（相对本组件最外层那个 View 的顶边）。
   * 调用方拿它把补全浮层钉到**这一行**的上方，而不是整块的上方。
   *
   * 量的是行、不是输入框本身：浮层要贴的是那一行的顶边，而输入框在行里还垂直居中着，
   * 拿输入框的 y 反而要再补一次行内偏移。
   */
  onFieldAnchorChange: (field: SuggestionField, anchor: FieldAnchor) => void;
};

// 记账底部面板最上面那块。四个文字字段各管一个维度：
//   topic 为了什么事 / remarks 具体买了啥 / merchant 在哪家 / location 在哪一带
// 主题和备注常驻，店名和地点收在展开区里——不是每笔消费都要记店家，
// 常驻四个输入框会让面板太高，也让"随手记一笔"变得有负担。
export function TransactionNoteFields({
  topic,
  onTopicChange,
  remark,
  onRemarkChange,
  merchant,
  onMerchantChange,
  location,
  onLocationChange,
  amount,
  currency,
  amountInBase,
  onCurrencyPress,
  onFocusedFieldChange,
  onFieldAnchorChange,
}: TransactionNoteFieldsProps) {
  const theme = useTheme();
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const money = splitMoney(amount, currency);

  // 收起时如果里面已经填了内容，给个小圆点提示，免得填过的东西被折叠起来就忘了
  const hasDetail = !!merchant.trim() || !!location.trim();

  return (
    <View style={styles.container}>
      <View
        style={styles.fieldRow}
        onLayout={(e) => {
          const { x, y } = e.nativeEvent.layout;
          onFieldAnchorChange('title', { x, y });
        }}>
        <View style={styles.inputGroup}>
          <Ionicons name="bookmark-outline" size={16} color={theme.textSecondary} />
          <TextInput
            value={topic}
            onChangeText={onTopicChange}
            onFocus={() => onFocusedFieldChange('title')}
            onBlur={() => onFocusedFieldChange(null)}
            placeholder="主题"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, styles.topicInput, { color: theme.text }]}
          />
        </View>
        {/* 金额本身就是换币种的按钮。不另起一个"币种"选项 chip，是因为币种不是这笔账的附加项——
            它是金额的一部分，"500" 这个数在没说清是哪种钱之前不成立。
            点数字换币种也符合直觉：手指本来就落在那个数上（刚用键盘打完它）。

            **货币符号染主题色，数字保持正文色**——这既是这块唯一的颜色，也是"这里可以点"的提示。
            原来在旁边挂了个下拉箭头，去掉了：那个箭头把金额往左挤了一截，
            而它说的事情（可以换）符号已经说了，还说得更准（换的是"哪种钱"，不是展开一个列表）。

            选中外币后下面多一行折算值，那一行是这块唯一会变高的地方，输入块整体高度因此只有两档 */}
        <Pressable onPress={onCurrencyPress} hitSlop={8} style={styles.amountBlock}>
          <ThemedText type="title" style={styles.amountDisplay}>
            <ThemedText style={[styles.amountSymbol, { color: theme.cardHighlight }]}>
              {money.sign}
              {money.symbol}
            </ThemedText>
            {money.digits}
          </ThemedText>
          {amountInBase !== null ? (
            <ThemedText type="small" themeColor="textSecondary">
              ≈ {formatCurrency(amountInBase)}
            </ThemedText>
          ) : null}
        </Pressable>
      </View>

      <View style={styles.fieldRow}>
        <View style={styles.inputGroup}>
          <Ionicons name="document-text-outline" size={16} color={theme.textSecondary} />
          <TextInput
            value={remark}
            onChangeText={onRemarkChange}
            placeholder="备注"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text }]}
          />
        </View>
        <Pressable onPress={() => setIsDetailOpen((open) => !open)} hitSlop={12} style={styles.toggleButton}>
          {hasDetail && !isDetailOpen && <View style={[styles.dot, { backgroundColor: theme.cardHighlight }]} />}
          <Ionicons
            name={isDetailOpen ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={hasDetail ? theme.cardHighlight : theme.textSecondary}
          />
        </Pressable>
      </View>

      {isDetailOpen && (
        <>
          {/* 店名和地点并排在同一行里，两个字段的锚点都从这一行量出来：
              纵向是同一个 y；横向两列等宽平分，所以第二列的左边缘
              = 行的左边缘 + (行宽 + 列间距) / 2。
              只挂这一个 onLayout，不给每一列各挂一个——那样还得把两次回调的结果凑到一起 */}
          <View
            style={styles.detailRow}
            onLayout={(e) => {
              const { x, y, width } = e.nativeEvent.layout;
              onFieldAnchorChange('merchant', { x, y });
              onFieldAnchorChange('location', { x: x + (width + DETAIL_GAP) / 2, y });
            }}>
            <View style={[styles.detailColumn, { backgroundColor: theme.backgroundSelected }]}>
              <Ionicons name="storefront-outline" size={16} color={theme.textSecondary} />
              <TextInput
                value={merchant}
                onChangeText={onMerchantChange}
                onFocus={() => onFocusedFieldChange('merchant')}
                onBlur={() => onFocusedFieldChange(null)}
                placeholder="店名"
                placeholderTextColor={theme.textSecondary}
                style={[styles.input, { color: theme.text }]}
              />
            </View>
            <View style={[styles.detailColumn, { backgroundColor: theme.backgroundSelected }]}>
              <Ionicons name="location-outline" size={16} color={theme.textSecondary} />
              <TextInput
                value={location}
                onChangeText={onLocationChange}
                onFocus={() => onFocusedFieldChange('location')}
                onBlur={() => onFocusedFieldChange(null)}
                placeholder="地点"
                placeholderTextColor={theme.textSecondary}
                style={[styles.input, { color: theme.text }]}
              />
            </View>
          </View>

        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.two,
    gap: Spacing.two,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  // 图标跟自己的输入框贴紧（gap 比 fieldRow 小一级），跟右边的金额/箭头拉开距离，
  // 间距层级跟下面 detailColumn 里的图标一致
  inputGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  input: {
    flex: 1,
    fontSize: 14,
  },
  topicInput: {
    fontSize: 16,
    fontWeight: '600',
  },
  // 整块右对齐：折算那一行比金额短，左对齐会让它吊在金额下方的空白里
  amountBlock: {
    alignItems: 'flex-end',
  },
  amountDisplay: {
    fontSize: AMOUNT_FONT_SIZE,
    lineHeight: AMOUNT_LINE_HEIGHT,
  },
  // 嵌在 amountDisplay 里面。**字号必须再写一遍**：ThemedText 不传 type 时默认是
  // `default`（fontSize 16），那份样式排在外层的 style 之后，会把继承来的 28 盖掉——
  // 于是符号莫名其妙地比数字小一圈。两处共用上面那两个常量，改字号时不会只改一边
  amountSymbol: {
    fontSize: AMOUNT_FONT_SIZE,
    lineHeight: AMOUNT_LINE_HEIGHT,
    fontWeight: '700',
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  detailRow: {
    flexDirection: 'row',
    gap: DETAIL_GAP,
  },
  detailColumn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    height: 36,
    borderRadius: 10,
    paddingHorizontal: Spacing.two,
  },
});
