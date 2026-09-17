import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { parseCategoryIcon } from '@/constants/category-icons';

type CategoryIconProps = {
  /** 库里 categories.icon 的原始值：emoji / `builtin:key` / `file://...` */
  icon: string | null | undefined;
  /** 图标本身的边长（emoji 就是字号）。外面那个圆底由调用方画，这里只管里面的图 */
  size?: number;
};

/**
 * 一个分类图标该长什么样，全 App 只在这里回答一次。
 *
 * 放 `category/` 而不是 `ui/`：它认识"分类图标有内置图片和用户图片两种来源"这个业务概念。
 * 也不放 `add-transaction/`：账单列表、分类管理页、以后的日历页都要画它，
 * 塞进记账页的目录会逼着别的页面从 add-transaction 里 import。
 *
 * 图片没登记时不留空白，落回那个 key 的兜底 emoji——图标是识别分类的主要线索，
 * 宁可显示一个不那么准的符号，也不要给一个空框。
 */
export function CategoryIcon({ icon, size = 20 }: CategoryIconProps) {
  const source = parseCategoryIcon(icon);

  if (source.kind === 'builtin' && source.image) {
    return <Image source={source.image} style={{ width: size, height: size }} contentFit="contain" />;
  }

  if (source.kind === 'file') {
    // 用户自己的图多半不是方的，用 cover + 圆角裁成方块，免得网格里一行图标高矮不一
    return (
      <Image
        source={{ uri: source.uri }}
        style={[styles.fileImage, { width: size, height: size, borderRadius: size / 4 }]}
        contentFit="cover"
      />
    );
  }

  const emoji = source.kind === 'builtin' ? source.fallbackEmoji : source.emoji;
  // lineHeight 跟字号绑死：默认行高会让 emoji 在圆底里偏上，一行图标看着东倒西歪
  return <ThemedText style={{ fontSize: size, lineHeight: size * 1.15 }}>{emoji}</ThemedText>;
}

const styles = StyleSheet.create({
  fileImage: {
    overflow: 'hidden',
  },
});
