import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { ScreenBottomInset } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * 页面内容末尾那颗「编辑」，点开是这一页的样式弹层（PageStyleSheet）。首页和日历都用它。
 *
 * 原来叫 HomeLayoutEditButton，跳去「我的 → 首页设置」那一页；那一页删了，
 * 弹层改成就地弹出：选一下就能在弹层后面看到页面变了样，不用来回跳页比较。
 *
 * **弹层不归这颗按钮管，归路由页**（app/(tabs)/index.tsx、calendar.tsx）：按钮在滚动内容里，
 * 换了画法那一段会重渲染，弹层要是挂在按钮下面，会在用户刚点下去的那一刻跟着消失。
 * 所以这里只报"被点了"。
 *
 * 只写「编辑」两个字：弹层里管的不只一件事（整页预设、上下两段、账单看多长）。
 *
 * **它同时就是底部留白本身**，外层高度写死 `ScreenBottomInset`，所以页面的内容容器
 * 不要再给 `paddingBottom`——否则留白会变成两倍。按钮压在这块空间的顶部、只占 36 高：
 * 底部 tab bar 中间那颗 ＋ 往上凸 24 并且水平居中，留在 36 以内两颗按钮不会叠在一起。
 */
export function PageEditButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={onPress}
        hitSlop={8}
        style={[styles.button, { backgroundColor: theme.backgroundElement }]}>
        <Ionicons name="options-outline" size={15} color={theme.cardHighlight} />
        <ThemedText type="small" themeColor="textSecondary">
          编辑
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: ScreenBottomInset,
    alignItems: 'center',
  },
  // 圆角是高度的一半（全圆），不走 CardRadius：它是颗按钮不是张卡，
  // 改 CardRadius 时这颗不该跟着变形（见 constants/theme 里那条）
  button: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: 18,
  },
});
