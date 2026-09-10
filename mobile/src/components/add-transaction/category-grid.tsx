import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type CategoryGridItem = {
  id: string;
  name: string;
  icon: string;
};

type CategoryGridProps = {
  categories: CategoryGridItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

// 分类网格，纯受控组件——categories 列表、选中态都由调用方传入，不关心数据是 mock 还是真实分类
export function CategoryGrid({ categories, selectedId, onSelect }: CategoryGridProps) {
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
                { backgroundColor: theme.background, borderColor: isSelected ? theme.accent : theme.backgroundSelected },
              ]}>
              <ThemedText style={styles.iconText}>{category.icon}</ThemedText>
            </View>
            <ThemedText type="small" themeColor={isSelected ? undefined : 'textSecondary'} style={isSelected ? { color: theme.accent } : undefined} numberOfLines={1}>
              {category.name}
            </ThemedText>
          </Pressable>
        );
      })}
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
  iconText: {
    fontSize: 22,
  },
});
