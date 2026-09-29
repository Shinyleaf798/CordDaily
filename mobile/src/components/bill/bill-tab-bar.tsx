import { useEffect, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { useTheme } from '@/hooks/use-theme';

/** 指示条的宽度。比一格窄很多——它标的是"哪一格"，不是"这一格有多宽" */
const INDICATOR_WIDTH = 28;

export type BillTab = 'overview' | 'category' | 'tag';

const TABS: { key: BillTab; label: string }[] = [
  { key: 'overview', label: '总览&明细' },
  { key: 'category', label: '分类' },
  { key: 'tag', label: '标签' },
];

/**
 * 分页的先后。页面那边的左右滑动要跟这一排的顺序严格一致，所以两边读的是同一个数组——
 * 各写一份的话，以后谁调了这里的顺序，滑动就会跟指示条指的方向相反，而且不会有任何报错。
 */
export const BILL_TAB_KEYS: BillTab[] = TABS.map((tab) => tab.key);

type BillTabBarProps = {
  value: BillTab;
  onChange: (value: BillTab) => void;
  /**
   * 现在停在第几页，**可以是小数**——页面把横向滚动位置换算成页码喂进来，
   * 指示条就跟着手指走，而不是等滑完了才跳过去。
   * 不传就退回自己按 value 补一段动画（这个组件单独用时还是能动的）。
   */
  progress?: Animated.AnimatedInterpolation<number>;
};

/**
 * 页面底部那排分页。下划线式，不是分段控件式。
 *
 * 两种选中样式在这个 App 里分工明确：**分段控件**（一块滑动的底）用在"同一组数据的几个视角"
 * 上——收支切换、总/年/月/周，它们是并列的开关；**下划线**用在"几块不同的内容"上，
 * 这里正是后者：总览、分类、标签是三块各自成立的内容，不是同一个数的三种算法。
 *
 * 指示条在**文字上方**（参考界面就是这么画的），不是下面：这一排贴着屏幕底边，
 * 下划线画在文字底下会紧挨着屏幕边缘，视觉上糊成一条；放上面则正好压在分隔线上，
 * 读起来是"这一格被从上面拉起来了"。
 *
 * 参考界面上还有第四格「成员」。这本账没有多人协作这回事，做一个点进去永远是空的分页
 * 比少一个分页更糟——所以是三格。
 */
export function BillTabBar({ value, onChange, progress }: BillTabBarProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);

  const activeIndex = Math.max(
    TABS.findIndex((tab) => tab.key === value),
    0,
  );
  // 惰性初始化：Animated.Value 只建一个（同 segmented-tabs / transaction-type-tabs）
  const [slide] = useState(() => new Animated.Value(activeIndex));

  useEffect(() => {
    // 页面给了滚动位置就不要自己再补一段：两个动画源同时往 translateX 上写，
    // 会在点分页栏的那一刻互相打架（一个直奔目标、一个跟着滚动走）
    if (progress) return;
    Animated.timing(slide, {
      toValue: activeIndex,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [activeIndex, slide, progress]);

  const tabWidth = width > 0 ? width / TABS.length : 0;
  const translateX = (progress ?? slide).interpolate({
    inputRange: TABS.map((_, index) => index),
    // 落在每一格的正中：先走到这一格的左边缘，再补上"格宽减指示条宽"的一半
    outputRange: TABS.map((_, index) => index * tabWidth + (tabWidth - INDICATOR_WIDTH) / 2),
    // 首尾两页回弹时页码会越界（iOS 往左拉出负数），不夹住的话指示条会跟着滑出分页栏
    extrapolate: 'clamp',
  });

  return (
    <View
      style={[styles.bar, { backgroundColor: theme.background, borderTopColor: theme.backgroundSelected }]}
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}>
      {/* 量出宽度之前不画：translateX 只吃数字，0 宽度算出来的位置全是 0 */}
      {width > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.indicator, { backgroundColor: theme.cardHighlight, transform: [{ translateX }] }]}
        />
      ) : null}

      {TABS.map((tab) => {
        const isActive = tab.key === value;
        return (
          <Pressable key={tab.key} onPress={() => onChange(tab.key)} style={styles.tab}>
            <ThemedText
              style={[styles.label, { color: isActive ? theme.cardHighlight : theme.textSecondary }]}>
              {tab.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    paddingBottom: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 26,
  },
  label: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  // 坐在分隔线上（top: -1 压住那条 hairline），所以它看起来是从边框上长出来的
  indicator: {
    position: 'absolute',
    top: -1,
    left: 0,
    width: INDICATOR_WIDTH,
    height: 3,
    borderRadius: 2,
  },
});
