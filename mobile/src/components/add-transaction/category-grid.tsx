import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { CategoryIcon } from '@/components/category/category-icon';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type CategoryGridItem = {
  id: string;
  name: string;
  /** 原样传库里 categories.icon 的值，怎么渲染由 CategoryIcon 决定 */
  icon: string | null;
};

type CategoryGridProps = {
  categories: CategoryGridItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** 末位「设置」格子点了做什么。不传就不画这个格子 */
  onSettingsPress?: () => void;
};

// 分类网格，纯受控组件——categories 列表、选中态都由调用方传入，不关心数据是 mock 还是真实分类。
//
// 「设置」固定排在最后一格，而不是做成页面右上角的按钮：
// 想改分类的念头几乎只在"扫了一遍网格没找到合适的分类"时冒出来，
// 那一刻用户的视线正停在网格末尾，入口就该在那里。
export function CategoryGrid({ categories, selectedId, onSelect, onSettingsPress }: CategoryGridProps) {
  const theme = useTheme();

  return (
    <View style={styles.grid}>
      {categories.map((category) => {
        const isSelected = category.id === selectedId;
        return (
          <Pressable key={category.id} onPress={() => onSelect(category.id)} style={styles.item}>
            <View
              style={[
                styles.iconWrap,
                { backgroundColor: theme.background, borderColor: isSelected ? theme.cardHighlight : theme.backgroundSelected },
              ]}>
              <CategoryIcon icon={category.icon} size={22} />
            </View>
            <ThemedText type="small" themeColor={isSelected ? undefined : 'textSecondary'} style={isSelected ? { color: theme.cardHighlight } : undefined} numberOfLines={1}>
              {category.name}
            </ThemedText>
          </Pressable>
        );
      })}

      {onSettingsPress ? (
        <Pressable onPress={onSettingsPress} style={styles.item}>
          {/* 虚线边框把它跟真正的分类区分开：它不是一个能选中的分类，选它不会填进这笔账 */}
          <View style={[styles.iconWrap, styles.settingsIconWrap, { borderColor: theme.backgroundSelected }]}>
            <Ionicons name="settings-outline" size={20} color={theme.textSecondary} />
          </View>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            设置
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: Spacing.three,
  },
  item: {
    width: '20%',
    alignItems: 'center',
    gap: Spacing.one,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsIconWrap: {
    borderStyle: 'dashed',
  },
});
