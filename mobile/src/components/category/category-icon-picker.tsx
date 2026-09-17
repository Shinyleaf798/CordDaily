import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CategoryIcon } from '@/components/category/category-icon';
import { ThemedText } from '@/components/ui/themed-text';
import { BUILTIN_CATEGORY_ICONS, EMOJI_CATEGORY_ICONS, builtinIconRef } from '@/constants/category-icons';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type CategoryIconPickerProps = {
  /** 当前选中的 icon 字符串，形状跟 categories.icon 一致 */
  value: string;
  onChange: (icon: string) => void;
};

/**
 * 新建/编辑分类时挑图标。两组：内置图库在上（跟默认分类同一套视觉），表情在下。
 *
 * 暂时没有"从相册上传"：那要引入 expo-image-picker 和一套本地文件生命周期
 * （复制进沙盒、删分类时清理、同步时上传），等接 Cloudinary 直传时一起做更省事。
 * 渲染层（CategoryIcon）已经认得 `file://`，到时候只要在这里多加一个入口。
 */
export function CategoryIconPicker({ value, onChange }: CategoryIconPickerProps) {
  const theme = useTheme();

  const renderTile = (icon: string, key: string) => {
    const isSelected = icon === value;
    return (
      <Pressable
        key={key}
        onPress={() => onChange(icon)}
        style={[
          styles.tile,
          {
            backgroundColor: isSelected ? theme.cardHighlight + '22' : theme.background,
            borderColor: isSelected ? theme.cardHighlight : 'transparent',
          },
        ]}>
        <CategoryIcon icon={icon} size={22} />
      </Pressable>
    );
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ThemedText type="small" themeColor="textSecondary">
        内置图标
      </ThemedText>
      <View style={styles.grid}>
        {BUILTIN_CATEGORY_ICONS.map((entry) => renderTile(builtinIconRef(entry.key), entry.key))}
      </View>

      <ThemedText type="small" themeColor="textSecondary" style={styles.sectionGap}>
        表情
      </ThemedText>
      <View style={styles.grid}>{EMOJI_CATEGORY_ICONS.map((emoji) => renderTile(emoji, emoji))}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // 定高而不是让它撑开：图标有五六十个，撑开的话下面的"保存"按钮会被挤出屏幕
  scroll: {
    maxHeight: 200,
  },
  content: {
    gap: Spacing.two,
    paddingBottom: Spacing.two,
  },
  sectionGap: {
    marginTop: Spacing.two,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  tile: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
