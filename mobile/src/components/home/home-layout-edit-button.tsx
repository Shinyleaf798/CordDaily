import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { ScreenBottomInset } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * 列表末尾那颗「编辑布局」。
 *
 * 文案跟「我的 → 首页布局」和导航栏标题**用同一个词**：两个入口去的是同一个地方，
 * 叫两个名字（"排版" / "布局"）会让人以为是两件事。
 *
 * **它同时就是底部留白本身**，外层高度写死 `ScreenBottomInset`，所以首页的内容容器
 * 不要再给 `paddingBottom`——否则 64 会变成 128，尾巴拖出一大段空。
 *
 * 按钮压在这块空间的**顶部**、只占 36 高：底部 tab bar 中间那颗 ＋ 按钮往上凸 24
 * 并且水平居中，这颗按钮也是水平居中的，两个都在中轴线上。留在 36 以内，
 * 底下那 28 正好是给 ＋ 让的位置，两颗按钮不会叠在一起。
 *
 * 入口放在这儿而不是「我的 → 首页布局」里（那条也还在）：**要改的东西就在眼前**——
 * 一路划到底看完这一屏，正是最容易冒出"上半想换个样子"这个念头的时刻。
 * 它是路由不是弹层：换排版是去一个有自己地址的地方做的事，做完要能返回
 * （判断标准跟 components/ui/modal-host 顶上那条是同一条）。
 */
export function HomeLayoutEditButton() {
  const theme = useTheme();

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => router.push('/settings/home-layout')}
        hitSlop={8}
        style={[styles.button, { backgroundColor: theme.backgroundElement }]}>
        <Ionicons name="options-outline" size={15} color={theme.cardHighlight} />
        <ThemedText type="small" themeColor="textSecondary">
          编辑布局
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
  button: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: 18,
  },
});
