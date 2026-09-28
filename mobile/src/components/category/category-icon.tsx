import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { FALLBACK_EMOJI, parseCategoryIcon } from '@/constants/category-icons';
import { customIconUri } from '@/db/category-icon-files';

type CategoryIconProps = {
  /** 库里 categories.icon 的原始值：emoji / `builtin:key` / `custom:文件名` / `file://...` */
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
  /**
   * 加载失败的那个 uri。**存 uri 而不是一个 boolean**：图标换一张之后 uri 就变了，
   * 下面那个 `uri !== brokenUri` 自然又成立，不需要 useEffect 把失败状态清掉——
   * 而用 effect 清 state 正是 eslint 的 react-hooks/set-state-in-effect 要拦的写法。
   */
  const [brokenUri, setBrokenUri] = useState<string | null>(null);

  if (source.kind === 'builtin' && source.image) {
    return <Image source={source.image} style={{ width: size, height: size }} contentFit="contain" />;
  }

  // 用户上传的图只在库里留了文件名，目录在哪是运行时才知道的事（见 db/category-icon-files.ts）
  const uri =
    source.kind === 'custom' ? customIconUri(source.fileName) : source.kind === 'file' ? source.uri : null;

  if (uri && uri !== brokenUri) {
    // 用户自己的图多半不是方的，用 cover + 圆角裁成方块，免得网格里一行图标高矮不一
    return (
      <Image
        source={{ uri }}
        style={[styles.fileImage, { width: size, height: size, borderRadius: size / 4 }]}
        contentFit="cover"
        // 文件可能不在了：从云端恢复的包带不了图片，用户也可能自己清过沙盒。
        // 不接这个回调的话那一格是**空白**——比显示错图标还糟，因为它看不出是坏了还是没设
        onError={() => setBrokenUri(uri)}
      />
    );
  }

  const emoji =
    source.kind === 'builtin' ? source.fallbackEmoji : source.kind === 'emoji' ? source.emoji : FALLBACK_EMOJI;
  // lineHeight 跟字号绑死：默认行高会让 emoji 在圆底里偏上，一行图标看着东倒西歪
  return <ThemedText style={{ fontSize: size, lineHeight: size * 1.15 }}>{emoji}</ThemedText>;
}

const styles = StyleSheet.create({
  fileImage: {
    overflow: 'hidden',
  },
});
