import { Ionicons } from '@expo/vector-icons';
import { router, Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// 直接从 expo-router 的 Tabs 组件推导 tabBar 参数类型，而不是从 @react-navigation/bottom-tabs 单独 import——
// 后者版本跟 expo-router 内部 vendor 的那份类型对不上（tintColor: ColorValue vs string 之类的细节冲突），
// 从组件本身推导就不存在这个版本不一致的问题
type TabBarProps = NonNullable<ComponentProps<typeof Tabs>['tabBar']> extends (props: infer P) => any ? P : never;

type IoniconName = keyof typeof Ionicons.glyphMap;

const ICONS: Record<string, { filled: IoniconName; outline: IoniconName }> = {
  index: { filled: 'home', outline: 'home-outline' },
  calendar: { filled: 'calendar', outline: 'calendar-outline' },
  stats: { filled: 'stats-chart', outline: 'stats-chart-outline' },
  settings: { filled: 'person', outline: 'person-outline' },
};

const LABELS: Record<string, string> = {
  index: '首页',
  calendar: '日历',
  stats: '统计',
  settings: '我的',
};

// 5 个底部按钮：4 个正常 tab + 中间凸起的圆形＋号按钮（跳去 /add 弹窗，不是真正的 tab）
// 见 docs/PROJECT-PLAN.md 第6节手机端页面结构
//
// 底部安全区（系统导航栏那一条）由**这里**的 edges={['bottom']} 独家负责。
// 四个 tab 页自己只能写 edges={['top','left','right']}——它们在这条 bar 上面，
// 再各自留一次底部安全区的话，那段空白会以页面底色（background）画出来，
// 变成 bar 上方凭空多一条黑边。
export function CustomTabBar({ state, navigation }: TabBarProps) {
  const theme = useTheme();
  const routes = state.routes;
  const leftRoutes = routes.slice(0, 2);
  const rightRoutes = routes.slice(2);

  const renderTab = (route: (typeof routes)[number], index: number) => {
    const isFocused = state.index === routes.indexOf(route);
    const icons = ICONS[route.name] ?? { filled: 'ellipse', outline: 'ellipse-outline' };
    const label = LABELS[route.name] ?? route.name;
    const color = isFocused ? theme.text : theme.textSecondary;

    const onPress = () => {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(route.name);
      }
    };

    return (
      <Pressable key={route.key} onPress={onPress} style={styles.tabButton}>
        <Ionicons name={isFocused ? icons.filled : icons.outline} size={24} color={color} />
        <ThemedText style={[styles.tabLabel, { color }]}>{label}</ThemedText>
      </Pressable>
    );
  };

  return (
    <SafeAreaView edges={['bottom']} style={[styles.container, { backgroundColor: theme.backgroundElement, borderTopColor: theme.backgroundSelected }]}>
      <View style={styles.row}>
        {leftRoutes.map(renderTab)}

        <Pressable onPress={() => router.push('/add')} style={[styles.fab, { backgroundColor: theme.cardHighlight }]}>
          <Ionicons name="add" size={28} color={theme.onCardHighlight} />
        </Pressable>

        {rightRoutes.map(renderTab)}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: 64,
    paddingHorizontal: 8,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 11,
    lineHeight: 14,
    marginTop: Spacing.half,
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -24,
  },
});
