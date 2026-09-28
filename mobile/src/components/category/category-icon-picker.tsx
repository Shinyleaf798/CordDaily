import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CategoryIcon } from '@/components/category/category-icon';
import { ThemedText } from '@/components/ui/themed-text';
import {
  BUILTIN_CATEGORY_ICONS,
  EMOJI_CATEGORY_ICONS,
  builtinIconRef,
  customIconFileName,
} from '@/constants/category-icons';
import { Spacing } from '@/constants/theme';
import { pickCustomCategoryIcon, pickCustomCategoryIconFromFile } from '@/db/category-icon-files';
import { useTheme } from '@/hooks/use-theme';

type CategoryIconPickerProps = {
  /** 当前选中的 icon 字符串，形状跟 categories.icon 一致 */
  value: string;
  onChange: (icon: string) => void;
};

/**
 * 新建/编辑分类时挑图标。三组：自己传的图在最上、内置图库居中、表情在下。
 *
 * **上传放第一个**，虽然用的人最少：内置图库有四十多格，放在它后面的东西等于不存在。
 * 而且这三组的关系不是并列的——上传是"以上都没有我要的"时的出路，出路应该在进门就看得见。
 *
 * **上传有两个按钮，不是一个**：系统相册选择器看不见 `Download/`，而分类图标最常见的来源
 * 就是下载来的品牌 logo。只给「相册」的话，那种用户会以为自己的图凭空消失了
 * （详见 db/category-icon-files.ts 的 pickCustomCategoryIconFromFile）。
 *
 * 选完图**只把引用交给上层的表单**（`onChange`），照片此刻已经落进沙盒，
 * 但那一行分类要等用户点「保存」才更新。所以选完又点取消会留下一个没人用的文件，
 * 由 `pruneUnusedCategoryIcons` 事后对账收走——这个方向的错（多一个孤儿文件）
 * 比反过来（先改库、用户却没点保存）轻得多。
 */
export function CategoryIconPicker({ value, onChange }: CategoryIconPickerProps) {
  const theme = useTheme();
  // 存的是"哪个按钮在忙"而不是一个布尔：转圈要转在被按的那个上，
  // 两个按钮一起变灰、却看不出是哪个在动，用户会以为自己点错了
  const [picking, setPicking] = useState<'library' | 'file' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const customName = customIconFileName(value);

  const upload = async (from: 'library' | 'file') => {
    if (picking) return;
    setPicking(from);
    setError(null);
    try {
      const icon = from === 'library' ? await pickCustomCategoryIcon() : await pickCustomCategoryIconFromFile();
      // null = 用户在选择器里点了取消。那不是错，什么都不做就对了
      if (icon) onChange(icon);
    } catch (caught) {
      // 权限被拒、图片解不开，都在这儿说出来。弹 Alert 会盖住刚打开的对话框，
      // 而这句话要跟那个按钮挨着才知道说的是谁
      setError(caught instanceof Error ? caught.message : '没能用这张图，换一张试试');
    } finally {
      setPicking(null);
    }
  };

  const renderPickButton = (from: 'library' | 'file', icon: 'images-outline' | 'folder-open-outline', label: string) => (
    <Pressable
      onPress={() => upload(from)}
      disabled={!!picking}
      style={[
        styles.pickButton,
        { borderColor: theme.textSecondary + '55', opacity: picking && picking !== from ? 0.4 : 1 },
      ]}>
      {picking === from ? (
        <ActivityIndicator size="small" color={theme.textSecondary} />
      ) : (
        <Ionicons name={icon} size={15} color={theme.textSecondary} />
      )}
      <ThemedText type="small">{label}</ThemedText>
    </Pressable>
  );

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
        自己的图片
      </ThemedText>
      <View style={styles.uploadRow}>
        {/* 这一格是**预览**不是按钮：旁边已经有两个按钮了，再让它也能点，
            用户会以为三个入口通向三件不同的事 */}
        <View
          style={[
            styles.tile,
            {
              backgroundColor: customName ? theme.cardHighlight + '22' : theme.background,
              borderColor: customName ? theme.cardHighlight : theme.textSecondary + '55',
              // 还没传图时用虚线：这一格跟下面那四十多格长得一样，实线会让它看起来
              // 也是"一个可以选的图标"，而它其实只是个占位
              borderStyle: customName ? 'solid' : 'dashed',
            },
          ]}>
          {customName ? (
            <CategoryIcon icon={value} size={22} />
          ) : (
            <Ionicons name="image-outline" size={20} color={theme.textSecondary} />
          )}
        </View>
        <View style={styles.uploadText}>
          <View style={styles.pickRow}>
            {renderPickButton('library', 'images-outline', '相册')}
            {renderPickButton('file', 'folder-open-outline', '文件')}
          </View>
          {/* 直说「下载的图在文件里」：两个按钮的区别对用户不是自明的，
              而猜错一次的代价是"我的图不见了" */}
          <ThemedText type="small" themeColor="textSecondary">
            下载来的图片在「文件」里。会缩小存一份，原图不动
          </ThemedText>
        </View>
      </View>

      {error ? (
        <ThemedText type="small" style={{ color: theme.expense }}>
          {error}
        </ThemedText>
      ) : null}

      <ThemedText type="small" themeColor="textSecondary" style={styles.sectionGap}>
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
  uploadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  uploadText: {
    flex: 1,
    gap: Spacing.one,
  },
  pickRow: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  pickButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.two,
    // 34 而不是更矮：这是个真要用手指点的按钮，比旁边 42 的图标格小一号就够了
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
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
