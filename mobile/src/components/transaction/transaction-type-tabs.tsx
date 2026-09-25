import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { useTheme } from '@/hooks/use-theme';

export type TransactionTypeTab = 'EXPENSE' | 'INCOME';

const TABS: { key: TransactionTypeTab; label: string }[] = [
  { key: 'EXPENSE', label: '支出' },
  { key: 'INCOME', label: '收入' },
];

// 轨道的几何是写死的，所以高亮块该滑到哪一步能直接算，不用 onLayout 去量：
// 每格 64 宽、格与格之间 4 的间距，于是第 n 格的左边缘是 n * 68。
// 量一遍当然更"通用"，但那要多一轮渲染才拿得到尺寸，首帧高亮块会落在 0 的位置闪一下。
const TAB_WIDTH = 64;
const TAB_HEIGHT = 32;
const TRACK_PADDING = 4;
const TAB_GAP = 4;
const TAB_STRIDE = TAB_WIDTH + TAB_GAP;

type TransactionTypeTabsProps = {
  value: TransactionTypeTab;
  onChange: (value: TransactionTypeTab) => void;
};

/**
 * 收入/支出的分段切换。从 add-transaction/ 挪到 transaction/ 是因为分类管理页也要用同一个控件：
 * 留在记账页的目录里，就会逼着分类管理页从 add-transaction 里 import 一个跟记账无关的东西。
 *
 * 高亮是**一块会滑动的底**，不是给选中那一格单独上色：
 * 两格各画各的底，切换时是一块凭空消失、另一块凭空出现，眼睛得自己去找它跑哪儿去了；
 * 一块滑过去则把"从这里到那里"这件事本身演出来了。
 *
 * 动画挂在 value 上而不是写在 onPress 里：这是个**受控**组件，
 * 编辑一笔已有的账时 value 是从外面直接给成 INCOME 的，没有任何一次点击发生过，
 * 写在点击回调里那种情况下高亮就停在错误的格子上。
 */
export function TransactionTypeTabs({ value, onChange }: TransactionTypeTabsProps) {
  const theme = useTheme();

  const activeIndex = Math.max(
    TABS.findIndex((tab) => tab.key === value),
    0,
  );
  // useState 的**惰性初始化**：括号里那个函数只在首次渲染跑一次，
  // Animated.Value 因此只建一个，之后每次渲染拿到的都是同一个（跟 modal-sheet、transaction-form 一个写法）。
  // 写成 useRef(...).current 也能建一次，但 eslint 的 react-hooks/refs 不许在渲染期间读 .current
  const [slide] = useState(() => new Animated.Value(activeIndex));

  useEffect(() => {
    Animated.timing(slide, {
      toValue: activeIndex,
      duration: 180,
      // 出场快、收尾慢：滑块看着像被"放"到位，而不是匀速挪过去
      easing: Easing.out(Easing.cubic),
      // 只动 transform，可以整个交给原生线程——JS 忙着重算分类网格时它也不会卡
      useNativeDriver: true,
    }).start();
  }, [activeIndex, slide]);

  // 按下标插值而不是写死 [0, TAB_STRIDE]：以后真要加第三段（比如「转账」），
  // 这里不用改，TABS 里加一行就够了
  const translateX = slide.interpolate({
    inputRange: TABS.map((_, index) => index),
    outputRange: TABS.map((_, index) => index * TAB_STRIDE),
  });

  return (
    <View style={[styles.container, { backgroundColor: theme.tabTrackBackground }]}>
      {/* 高亮块铺在文字底下，绝对定位所以不参与布局——它动的时候两个格子一格不挪 */}
      <Animated.View
        pointerEvents="none"
        style={[styles.thumb, { backgroundColor: theme.background, transform: [{ translateX }] }]}
      />

      {TABS.map((tab) => {
        const isActive = tab.key === value;
        return (
          <Pressable key={tab.key} onPress={() => onChange(tab.key)} style={styles.tab}>
            {/* 文字颜色跟着瞬间切换，不做淡入淡出：滑块已经在交代"选中的是哪一格"了，
                再让两段文字同时处在半明半暗的中间态，反而说不清当前到底选了谁 */}
            <ThemedText type="smallBold" themeColor={isActive ? 'text' : 'textSecondary'}>
              {tab.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignSelf: 'center',
    borderRadius: 12,
    padding: TRACK_PADDING,
    gap: TAB_GAP,
  },
  tab: {
    width: TAB_WIDTH,
    height: TAB_HEIGHT,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 起点就是第一格的位置（轨道内边距），之后靠 translateX 往右挪整数个 TAB_STRIDE
  thumb: {
    position: 'absolute',
    top: TRACK_PADDING,
    left: TRACK_PADDING,
    width: TAB_WIDTH,
    height: TAB_HEIGHT,
    borderRadius: 9,
  },
});
