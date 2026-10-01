import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { ScreenPadding, Spacing } from '@/constants/theme';

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
 * 常规尺寸，以后右边真放按钮进来不用再调；底下再留一截 `COLOR_TAIL` 的内距。
 *
 * ## 它没有自己的底色
 *
 * 原来这一条铺 `backgroundElement`，比页面底色亮一级，于是四个 tab 页顶上都压着一块板。
 * 那块板**什么都不负责**：它不滚动、不分隔两段内容、下面也没有需要被挡住的东西——
 * 它只是让标题看起来像被装在一个容器里。去掉之后标题直接坐在页面底色上，
 * 跟底下第一张卡片的关系由间距交代，而不是由两种底色交代。
 *
 * 高度一个像素没动：去掉的是颜色，不是那条 bar。
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
  return (
    <View style={styles.header}>
      <ThemedText type="pageTitle">{title}</ThemedText>
      {right}
    </View>
  );
}

/** 标题那一行本身的高度。见上面「写死的高度」那段 */
const ROW_HEIGHT = 44;

/**
 * 标题行底下多留的一截。
 *
 * 它本来是**色块**往下多铺的一段——那时这条 bar 自己有底色（backgroundElement），
 * 多铺一点是为了让它和下面的内容别断得太硬。现在底色去掉了，这一截就只是内距，
 * 留着是因为那点呼吸本身是对的，而且动它会让四个 tab 页的标题一起上移。
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
