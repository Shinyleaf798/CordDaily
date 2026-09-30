import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// 一个个手写 require，不能拼字符串——Metro 在打包时就要解析出这个路径
// （同 constants/category-icons.ts 顶上那条）
const SEARCH_ICON = require('../../../assets/extra-images/transparency.png');
const OVERVIEW_ICON = require('../../../assets/extra-images/budget.png');

type HomeHeaderActionsProps = {
  /** 展开搜索层。不是路由跳转——搜索就地展开在首页上（见 components/search/search-overlay） */
  onOpenSearch: () => void;
};

/**
 * 首页标题右边那两个入口：搜索、账单预览。
 *
 * 做成一个组件而不是在两套布局里各摆一遍：两套布局是"同一页的两种长相"，
 * 右上角有什么入口不该是其中一种布局的私事——在节奏条上能搜、切到金环就搜不了，
 * 那不是布局差异，那是功能丢了。以后再加第三个入口，改这一个文件。
 *
 * 归 home/ 不归 ui/：它认识"账单预览"和"搜索"这两件具体的事。
 * ui/ 里放的是不认识任何业务概念的展示件（见 CLAUDE.md 的归类规则）。
 *
 * 两个入口的去向不一样，这不是随意的：账单预览是**一个地方**（有自己的地址、要进返回栈、
 * 从别处也该能直接跳过去），所以是路由；搜索是**当前这一屏上的一个动作**，
 * 展开、看一眼、收起，中间没有"去过哪里"这回事，所以只是一个回调
 * （判断标准跟 components/ui/modal-host 顶上那条是同一条）。
 *
 * 两个图标是图片不是 Ionicons，但**行为跟原来的图标一模一样**：两张图都是纯黑描边 + 透明底，
 * 走 expo-image 的 `tintColor`（"把颜色刷到每一个非透明像素上"）染成 `theme.text`，
 * 于是浅色主题下是黑、深色下是白，跟"首页"那两个字始终同色。
 *
 * 这么做而不是准备浅色/深色两套图：**两套图迟早会走散**——换图标时只换了一套，
 * 另一套要等到有人切主题才会被发现，而那种 bug 谁都不会主动去找。
 * 前提是图必须是单色的；哪天换成彩色图，这一行 tintColor 就得去掉（那时也就真的要两套图了）。
 *
 * 尺寸 26，比原来那对描边图标（22 / 21）大一圈：这两张图里有细节
 * （放大镜的手柄、饼图的分块），缩到 20 会糊成一团。触控区 34×34，不跟着图走。
 */
export function HomeHeaderActions({ onOpenSearch }: HomeHeaderActionsProps) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      <Pressable onPress={onOpenSearch} hitSlop={8} style={styles.button}>
        <Image source={SEARCH_ICON} style={styles.icon} contentFit="contain" tintColor={theme.text} />
      </Pressable>

      <Pressable onPress={() => router.push('/bill-overview')} hitSlop={8} style={styles.button}>
        <Image source={OVERVIEW_ICON} style={styles.icon} contentFit="contain" tintColor={theme.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    // 两个图标之间留 Spacing.three + 各自 34 宽的触控区。
    // 原来是 4（触控区几乎贴着），图放大到 26 之后两张图之间只剩一条缝，挤成了一块。
    // 撑开到 16 仍然读得出是"一组入口"——同一组的间距只要明显小于它们离标题的距离就够
    gap: Spacing.three,
  },
  button: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 只管图本身，触控区是上面那个 button：图放大不该让两个入口挨得更近
  icon: {
    width: 26,
    height: 26,
  },
});
