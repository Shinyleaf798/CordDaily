import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useFieldSuggestions } from '@/hooks/use-transactions';
import { useTheme } from '@/hooks/use-theme';
import type { SuggestionField } from '@/db/transactions';

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
}: TransactionNoteFieldsProps) {
  const theme = useTheme();
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  // 同一时刻只可能有一个补全列表展开，所以存"哪个字段聚焦中"，不用每个字段各存一个 boolean
  const [focusedField, setFocusedField] = useState<SuggestionField | null>(null);

  // 收起时如果里面已经填了内容，给个小圆点提示，免得填过的东西被折叠起来就忘了
  const hasDetail = !!merchant.trim() || !!location.trim();

  return (
    <View style={styles.container}>
      <View style={styles.fieldRow}>
        <View style={styles.inputGroup}>
          <Ionicons name="bookmark-outline" size={16} color={theme.textSecondary} />
          <TextInput
            value={topic}
            onChangeText={onTopicChange}
            placeholder="主题"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, styles.topicInput, { color: theme.text }]}
          />
        </View>
        <ThemedText type="title" style={styles.amountDisplay}>
          RM{amount.toFixed(2)}
        </ThemedText>
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
          <View style={styles.detailRow}>
            <View style={[styles.detailColumn, { backgroundColor: theme.backgroundSelected }]}>
              <Ionicons name="storefront-outline" size={16} color={theme.textSecondary} />
              <TextInput
                value={merchant}
                onChangeText={onMerchantChange}
                onFocus={() => setFocusedField('merchant')}
                onBlur={() => setFocusedField(null)}
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
                onFocus={() => setFocusedField('location')}
                onBlur={() => setFocusedField(null)}
                placeholder="地点"
                placeholderTextColor={theme.textSecondary}
                style={[styles.input, { color: theme.text }]}
              />
            </View>
          </View>

          {focusedField && (
            <SuggestionRow
              field={focusedField}
              keyword={focusedField === 'merchant' ? merchant : location}
              onPick={focusedField === 'merchant' ? onMerchantChange : onLocationChange}
            />
          )}
        </>
      )}
    </View>
  );
}

// 历史补全的横向 chip 列表。只有店名和地点这两个"会被反复输入同样值"的字段才配它，
// 主题和备注每笔都不一样，给补全反而碍事
function SuggestionRow({
  field,
  keyword,
  onPick,
}: {
  field: SuggestionField;
  keyword: string;
  onPick: (value: string) => void;
}) {
  const theme = useTheme();
  const { data: suggestions } = useFieldSuggestions(field, keyword);

  // 已经输入的内容跟建议完全一样时没必要再显示一遍
  const items = (suggestions ?? []).filter((item) => item !== keyword.trim());
  if (items.length === 0) return null;

  return (
    <View style={styles.chipRow}>
      {items.map((item) => (
        <Pressable
          key={item}
          // onPress 会在 TextInput 的 onBlur 之后才触发，用 onPressIn 才能在列表被收起前拿到点击
          onPressIn={() => onPick(item)}
          style={[styles.chip, { backgroundColor: theme.backgroundSelected }]}>
          <ThemedText type="small">{item}</ThemedText>
        </Pressable>
      ))}
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
  amountDisplay: {
    fontSize: 28,
    lineHeight: 34,
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
    gap: Spacing.two,
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  chip: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 8,
  },
});
