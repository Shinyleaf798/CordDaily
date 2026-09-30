import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { ScreenPadding, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type PageHeaderProps = {
  title: string;
  /** 标题右侧的位置，留给搜索、图表这类页面级入口 */
  right?: ReactNode;
};

/**
 * 底部四个 tab 页共用的顶部标题条。
 *
 * 在这之前每页各写一行 `<ThemedText type="pageTitle">`，字号是一致的（都走 pageTitle），
 * 但**上下占多高**各页说了算——我的那页顶上留 24、其余留 12，切 tab 时标题会上下跳一格。
 * 没人是故意的：一行裸文字的高度是由它所在容器的 padding 和 gap 拼出来的，
 * 而那两个数在每个页面的 styles 里，谁也看不见谁。
 *
 * 所以这里给它一个**写死的高度**：不管字号怎么改、右边挂不挂图标，这一条永远这么高。
 * 标题行 `ROW_HEIGHT` = pageTitle 的 lineHeight 34 + 上下各 5 的呼吸，也正好是触控目标的
 * 常规尺寸，以后右边真放按钮进来不用再调；底下再多铺一截 `COLOR_TAIL` 的纯色。
 *
 * ## 它钉在屏幕顶上，不在 ScrollView 里
 *
 * 调用方把它放在 `SafeAreaView` 底下、`ScrollView` **外面**，跟底部 tab bar 对称：
 * 上下两条 bar 都是钉住的框，中间那块才是会滚的内容。
 *
 * 这件事不只是"不跟着滚"。它曾经待在 ScrollView 内容容器里，于是底色要铺满整宽就得用
 * 负 margin 把容器的内距顶出去，再把横向内距加回来；而"顶出去多少"必须跟五个页面的
 * `paddingTop` 逐一对上，那个假定一度还挂在 `ScreenPadding` 上（那时左右和上下恰好都是
 * 12，看不出是两件事，左右一收窄五页就集体错位）；连"它和第一张卡隔多远"都不归它管，
 * 是容器 `gap` 顺手给的，想单独调还得再拿一个负 marginBottom 去减。
 *
 * 拎出来之后这些全没了：底色本来就铺满整宽，横向内距直接写，间距由各页 ScrollView
 * 自己的 `paddingTop`（`ScreenGap`）说了算。**这个文件现在只剩"一条多高、什么色、
 * 左右留多少"**——那本来就是它该知道的全部。
 *
 * 代价是它永久占掉 `ROW_HEIGHT + COLOR_TAIL` 的高度，不再滚走。
 *
 * 它不认识任何业务概念（只有一个字符串和一个插槽），所以归 ui/ 而不是某个页面目录。
 */
export function PageHeader({ title, right }: PageHeaderProps) {
  const theme = useTheme();

  return (
    <View style={[styles.header, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="pageTitle">{title}</ThemedText>
      {right}
    </View>
  );
}

/** 标题那一行本身的高度。见上面「写死的高度」那段 */
const ROW_HEIGHT = 44;

/**
 * 色块在标题行**下面**多铺出来的一截。
 *
 * 是 padding 不是 margin：要的是「这条 bar 的底色多往下走一点」，
 * 不是「bar 和下面的内容之间多一条空白」。写成 margin 的话，
 * 深色主题里那段会是一条明显的黑带（页面底色），bar 看着反而更孤立了。
 */
const COLOR_TAIL = Spacing.one;

const styles = StyleSheet.create({
  header: {
    // RN 是 border-box：height 含 padding，所以内容行仍然是 ROW_HEIGHT 高，
    // alignItems: center 居中的也还是那 44
    height: ROW_HEIGHT + COLOR_TAIL,
    paddingBottom: COLOR_TAIL,
    paddingHorizontal: ScreenPadding,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
