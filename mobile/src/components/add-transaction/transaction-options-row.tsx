import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type TransactionOptionsRowProps = {
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  isReimbursable: boolean;
  onReimbursableChange: (value: boolean) => void;
  excludeFromStats: boolean;
  onExcludeFromStatsChange: (value: boolean) => void;
  onCameraPress?: () => void;
};

// 对应 schema 里已有的三个字段：tags / isReimbursable / excludeFromStats。
// "无成员"（数据模型没有这个概念）、"优惠"（没有对应字段）这次都不做。
// 拍照按钮先做右侧的 UI 占位，实际的拍摄/选图 + Cloudinary 直传逻辑等后续接入图片存储阶段再实现
export function TransactionOptionsRow({
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
      <View style={styles.iconRow}>
        <View style={styles.iconGroup}>
          <Pressable style={styles.iconButton} onPress={() => setIsTagInputOpen((v) => !v)}>
            <Ionicons name={tags.length > 0 ? 'pricetag' : 'pricetag-outline'} size={20} color={tags.length > 0 ? theme.accent : theme.textSecondary} />
            <ThemedText type="small" themeColor={tags.length > 0 ? 'text' : 'textSecondary'}>
              标签{tags.length > 0 ? ` (${tags.length})` : ''}
            </ThemedText>
          </Pressable>

          <Pressable style={styles.iconButton} onPress={() => onReimbursableChange(!isReimbursable)}>
            <Ionicons name={isReimbursable ? 'cash' : 'cash-outline'} size={20} color={isReimbursable ? theme.accent : theme.textSecondary} />
            <ThemedText type="small" themeColor={isReimbursable ? 'text' : 'textSecondary'}>
              报销
            </ThemedText>
          </Pressable>

          <Pressable style={styles.iconButton} onPress={() => onExcludeFromStatsChange(!excludeFromStats)}>
            <Ionicons name={excludeFromStats ? 'eye-off' : 'eye-off-outline'} size={20} color={excludeFromStats ? theme.accent : theme.textSecondary} />
            <ThemedText type="small" themeColor={excludeFromStats ? 'text' : 'textSecondary'}>
              不计入统计
            </ThemedText>
          </Pressable>
        </View>

        <Pressable style={[styles.cameraButton, { backgroundColor: theme.backgroundElement }]} onPress={onCameraPress} hitSlop={8}>
          <Ionicons name="camera-outline" size={20} color={theme.textSecondary} />
        </Pressable>
      </View>

      {isTagInputOpen && (
        <View style={styles.tagArea}>
          {tags.length > 0 && (
            <View style={styles.chipRow}>
              {tags.map((tag) => (
                <Pressable key={tag} onPress={() => removeTag(tag)} style={[styles.chip, { backgroundColor: theme.backgroundElement }]}>
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
            style={[styles.tagInput, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconGroup: {
    flexDirection: 'row',
    gap: Spacing.four,
  },
  iconButton: {
    alignItems: 'center',
    gap: 2,
  },
  cameraButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagArea: {
    gap: Spacing.two,
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
  tagInput: {
    height: 40,
    borderRadius: 10,
    paddingHorizontal: Spacing.two,
    fontSize: 14,
  },
});
