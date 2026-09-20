import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatClockTime, formatDayLabel } from '@/utils/date';

type TransactionOptionsRowProps = {
  date: Date;
  onDatePress: () => void;
  /** 没选到账户时传 null，那一格会用支出色提醒——这是保存前必须填的 */
  accountName: string | null;
  onAccountPress: () => void;
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  isReimbursable: boolean;
  onReimbursableChange: (value: boolean) => void;
  excludeFromStats: boolean;
  onExcludeFromStatsChange: (value: boolean) => void;
  onCameraPress?: () => void;
};

/**
 * 这笔账的全部附加项挤在一行里：日期、账户、标签、报销、不计入统计。
 *
 * 合成一行而不是分两行，是因为它们是同一类东西——**都有默认值、都不是每笔都要碰**。
 * 分两行会让人以为上面那行（日期/账户）比下面那行重要，而实际上改账户的频率比打标签还低。
 * 一行放不下就横向滚动，不折行：折行会让这块的高度随内容跳动，底下的键盘跟着上下移。
 *
 * 拍照按钮钉在右边、不进滚动区：它是这一行里唯一"打开另一个界面"的动作，
 * 滑走了就找不着了。实际的拍摄/直传等接入图片存储阶段再做。
 */
export function TransactionOptionsRow({
  date,
  onDatePress,
  accountName,
  onAccountPress,
  tags,
  onTagsChange,
  isReimbursable,
  onReimbursableChange,
  excludeFromStats,
  onExcludeFromStatsChange,
  onCameraPress,
}: TransactionOptionsRowProps) {
  const theme = useTheme();
  const [isTagInputOpen, setIsTagInputOpen] = useState(false);
  const [draftTag, setDraftTag] = useState('');

  const commitDraftTag = () => {
    const trimmed = draftTag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onTagsChange([...tags, trimmed]);
    }
    setDraftTag('');
  };

  const removeTag = (tag: string) => {
    onTagsChange(tags.filter((t) => t !== tag));
  };

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.chips}>
          <OptionChip
            icon="calendar-outline"
            label={`${formatDayLabel(date)} ${formatClockTime(date)}`}
            onPress={onDatePress}
          />
          <OptionChip
            icon="wallet-outline"
            label={accountName ?? '选择账户'}
            missing={!accountName}
            onPress={onAccountPress}
          />
          <OptionChip
            icon={tags.length > 0 ? 'pricetag' : 'pricetag-outline'}
            label={`标签${tags.length > 0 ? ` (${tags.length})` : ''}`}
            active={tags.length > 0}
            onPress={() => setIsTagInputOpen((v) => !v)}
          />
          <OptionChip
            icon={isReimbursable ? 'cash' : 'cash-outline'}
            label="报销"
            active={isReimbursable}
            onPress={() => onReimbursableChange(!isReimbursable)}
          />
          <OptionChip
            icon={excludeFromStats ? 'eye-off' : 'eye-off-outline'}
            label="不计入统计"
            active={excludeFromStats}
            onPress={() => onExcludeFromStatsChange(!excludeFromStats)}
          />
        </ScrollView>

        <Pressable
          style={[styles.cameraButton, { backgroundColor: theme.background }]}
          onPress={onCameraPress}
          hitSlop={8}>
          <Ionicons name="camera-outline" size={18} color={theme.textSecondary} />
        </Pressable>
      </View>

      {isTagInputOpen && (
        <View style={styles.tagArea}>
          {tags.length > 0 && (
            <View style={styles.chipRow}>
              {tags.map((tag) => (
                <Pressable
                  key={tag}
                  onPress={() => removeTag(tag)}
                  style={[styles.tagChip, { backgroundColor: theme.background }]}>
                  <ThemedText type="small">{tag} ×</ThemedText>
                </Pressable>
              ))}
            </View>
          )}
          <TextInput
            value={draftTag}
            onChangeText={setDraftTag}
            onSubmitEditing={commitDraftTag}
            placeholder="输入标签后回车"
            placeholderTextColor={theme.textSecondary}
            returnKeyType="done"
            style={[styles.tagInput, { color: theme.text, backgroundColor: theme.background }]}
          />
        </View>
      )}
    </View>
  );
}

type OptionChipProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  /** 这一项已经填了/开着 */
  active?: boolean;
  /** 这一项还缺着，且是保存前必填的 */
  missing?: boolean;
  onPress: () => void;
};

// 五项长得完全一样：黑底 + 白字 + 一个图标。差别只在图标和文字的颜色，
// 用颜色而不是用形状表达状态，这样一行扫过去能立刻看出哪几项被动过
function OptionChip({ icon, label, active, missing, onPress }: OptionChipProps) {
  const theme = useTheme();
  const accent = missing ? theme.expense : active ? theme.cardHighlight : theme.textSecondary;

  return (
    <Pressable onPress={onPress} style={[styles.chip, { backgroundColor: theme.background }]}>
      <Ionicons name={icon} size={14} color={accent} />
      <ThemedText type="small" numberOfLines={1} style={missing ? { color: theme.expense } : undefined}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingRight: Spacing.two,
  },
  chips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  // 整排缩一圈：省下来的高度全归数字键盘（它是 flex: 1，外壳高度不变的情况下自动吃掉）
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 28,
    paddingHorizontal: Spacing.one,
    borderRadius: 8,
  },
  cameraButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagArea: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  tagChip: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 8,
  },
  tagInput: {
    height: 40,
    borderRadius: 10,
    paddingHorizontal: Spacing.two,
    fontSize: 14,
  },
});
