import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

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
 * 图标用描边版（-outline）而不是实心：这一行的主角是"首页"那两个字，
 * 实心图标的份量会跟标题抢，而它们俩只是入口。
 */
export function HomeHeaderActions({ onOpenSearch }: HomeHeaderActionsProps) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      <Pressable onPress={onOpenSearch} hitSlop={8} style={styles.button}>
        <Ionicons name="search-outline" size={22} color={theme.text} />
      </Pressable>

      <Pressable onPress={() => router.push('/bill-overview')} hitSlop={8} style={styles.button}>
        <Ionicons name="pie-chart-outline" size={21} color={theme.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    // 两个图标之间留 4 + 各自 32 宽的触控区 = 手指够得着，看上去又是一组
    gap: 4,
  },
  button: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
