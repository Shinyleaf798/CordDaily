import { useEffect, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { useTheme } from '@/hooks/use-theme';

const TRACK_PADDING = 3;
const TAB_HEIGHT = 30;

export type SegmentedTabItem<T extends string> = { key: T; label: string };

type SegmentedTabsProps<T extends string> = {
  items: SegmentedTabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /**
   * 轨道和滑块的颜色。默认是"浅轨道 + 深滑块"（跟收支切换一致，那是铺在卡片上的用法）。
   *
   * 留成可传是因为铺在**页面底色**上时这组关系要反过来——黑底上一条更黑的轨道看不见，
   * 得是"深轨道 + 浅滑块"。颜色本身仍然由调用方从主题里取，这个组件不认识具体的色值。
   */
  trackColor?: string;
  thumbColor?: string;
};

/**
 * 等宽的分段切换。高亮是一块会滑动的底，几段都行。
 *
 * 跟 transaction/transaction-type-tabs 的关系：那个是**收支**切换，格子宽度写死 64
 * （两段、字数固定，写死能省掉一轮测量，首帧不会闪）。这个不认识任何业务概念，
 * 只知道"几个选项 + 选中的是哪个"，格子宽度得跟着容器走——所以它进 ui/，那个留在 transaction/。
 * 没有把那个改成这个的调用方：它那份写死的几何是有意的，换成测量反而退步。
 *
 * **测量出来之前不画高亮块**。等宽格子的位移得知道轨道多宽才算得出来（translateX 只吃数字，
 * 不吃百分比字符串），而宽度要等第一次 onLayout。先画一个宽 0 的块再让它长开，
 * 看起来像个 bug；等一帧再出现，看起来只是"它本来就在那儿"。
 *
 * 动画挂在 value 上而不是写在 onPress 里：这是个受控组件，
 * 外面直接把 value 改掉（比如"回到本月"这种按钮）时也得跟着滑过去。
 */
export function SegmentedTabs<T extends string>({
  items,
  value,
  onChange,
  trackColor,
  thumbColor,
}: SegmentedTabsProps<T>) {
  const theme = useTheme();
  const [trackWidth, setTrackWidth] = useState(0);

  const activeIndex = Math.max(
    items.findIndex((item) => item.key === value),
    0,
  );
  // 惰性初始化：Animated.Value 只建一个，之后每次渲染拿到的都是同一个（同 transaction-type-tabs）
  const [slide] = useState(() => new Animated.Value(activeIndex));

  useEffect(() => {
    Animated.timing(slide, {
      toValue: activeIndex,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [activeIndex, slide]);

  const tabWidth = trackWidth > 0 ? trackWidth / items.length : 0;
  const translateX = slide.interpolate({
    inputRange: items.map((_, index) => index),
    outputRange: items.map((_, index) => index * tabWidth),
  });

  const onTrackLayout = (event: LayoutChangeEvent) => {
    // 减去左右内距：高亮块是在轨道**里面**滑的
    const width = event.nativeEvent.layout.width - TRACK_PADDING * 2;
    if (width > 0 && width !== trackWidth) setTrackWidth(width);
  };

  return (
    <View
      style={[styles.track, { backgroundColor: trackColor ?? theme.tabTrackBackground }]}
      onLayout={onTrackLayout}>
      {trackWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.thumb,
            { width: tabWidth, backgroundColor: thumbColor ?? theme.background, transform: [{ translateX }] },
          ]}
        />
      ) : null}

      {items.map((item) => (
        <Pressable key={item.key} onPress={() => onChange(item.key)} style={styles.tab}>
          <ThemedText type="smallBold" themeColor={item.key === value ? 'text' : 'textSecondary'}>
            {item.label}
          </ThemedText>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: 11,
    padding: TRACK_PADDING,
  },
  tab: {
    // 等宽靠 flex:1 而不是量出来的宽度：格子本身交给布局引擎分，
    // 要量的只有高亮块该往右挪多少（那个 transform 只吃数字）
    flex: 1,
    height: TAB_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumb: {
    position: 'absolute',
    top: TRACK_PADDING,
    left: TRACK_PADDING,
    height: TAB_HEIGHT,
    borderRadius: 8,
  },
});
