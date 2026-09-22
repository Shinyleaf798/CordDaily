import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router/js-stack';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';

import { ScreenTransitions } from '@/constants/screen-transitions';
import { ThemeScheme } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { seedDefaultAccounts } from '@/db/accounts';
import { seedDefaultCategories, seedDefaultSubcategories } from '@/db/categories';
import { useAuthStore } from '@/store/auth.store';
import { useHomeLayoutStore } from '@/store/home-layout.store';
import { useThemeStore } from '@/store/theme.store';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

export default function RootLayout() {
  const theme = useTheme();
  const isAuthHydrated = useAuthStore((s) => s.isHydrated);
  const user = useAuthStore((s) => s.user);
  const hydrateAuth = useAuthStore((s) => s.hydrate);

  const isThemeHydrated = useThemeStore((s) => s.isHydrated);
  const themeName = useThemeStore((s) => s.themeName);
  const hydrateTheme = useThemeStore((s) => s.hydrate);

  // 首页布局偏好也要在首屏之前读出来，否则会先闪一下默认布局再跳成用户选的那套
  const isHomeLayoutHydrated = useHomeLayoutStore((s) => s.isHydrated);
  const hydrateHomeLayout = useHomeLayoutStore((s) => s.hydrate);

  const isHydrated = isAuthHydrated && isThemeHydrated && isHomeLayoutHydrated;

  useEffect(() => {
    hydrateAuth();
    hydrateTheme();
    hydrateHomeLayout();
    // 首次启动灌默认分类和默认账户。放在这里而不是 db/client.ts 的 getDb 里，是因为这两个模块都要 import getDb，
    // 反过来让 client.ts import 它们会形成循环依赖。
    // 两个都是"空库才跑"，所以每次启动多两次 COUNT 查询，装过一次之后就直接返回
    // 二级分类必须等一级灌完才跑：它按父分类的名字去找 parentId，父还不存在就全跳过了
    seedDefaultCategories()
      .then(seedDefaultSubcategories)
      .catch(() => {
        // 灌种子失败不该挡住启动：分类页仍然可以手动新建
      });
    seedDefaultAccounts().catch(() => {
      // 同上：账户页可以手动新建账户
    });
  }, [hydrateAuth, hydrateTheme, hydrateHomeLayout]);

  useEffect(() => {
    if (isHydrated) {
      SplashScreen.hideAsync();
    }
  }, [isHydrated]);

  // 根视图底色：整棵 React 树后面那块原生窗口，启动图收掉到首屏之间、透明屏底下会露出来。
  // 它在 Android 上默认是白的，黑色主题下不设就闪一下刺眼的白。
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.background).catch(() => {
      // 设不上只是回到默认底色，不该挡住启动
    });
  }, [theme.background]);

  if (!isHydrated) {
    return null;
  }

  // 导航器有自己一套颜色（屏幕底色、header、返回箭头、标题），默认只有 light/dark 两档，对不上三套主题。
  // colors.background 就是每张卡片的底色，内容没渲染出来的那几帧只剩它——所以各屏不用再单独铺背景。
  // 只覆盖颜色，保留 base 的 dark 标记和字体配置：那两样是给系统控件用的。
  const base = ThemeScheme[themeName] === 'dark' ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...base,
    colors: {
      ...base.colors,
      background: theme.background,
      card: theme.backgroundElement,
      text: theme.text,
      border: theme.backgroundSelected,
      primary: theme.cardHighlight,
      notification: theme.expense,
    },
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={navigationTheme}>
        {/* JS 栈，不是默认那份原生栈：原生栈 pop 时路由当场从 state.routes 移除、React 立刻卸载，
            而原生层还在播动画，滑走的是个空壳（NativeStackView.js:53-54）。JS 栈用 closingRouteKeys
            留到动画播完才移除，顺带动画也变成可以自己写的（见 DECISIONS.md 2026-09-17）。 */}
        <Stack>
          <Stack.Protected guard={!!user}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            {/* 记一笔从右滑入、保存后原路滑回右边（见 ScreenTransitions.push 的注释）。
                返回动画不用单独配：slide_from_right 的出场本来就是它的逆过程。

                title 必须写在这里，不能只靠 TransactionForm 里那个 <Stack.Screen>：
                那份 options 跟着组件走，组件不在的那几帧（编辑模式还在查数据）标题会退回
                路由名 "Add"。写在路由这一层的才是这个页面的"底线外观"，
                组件里那份只负责它额外要的东西（收支切换 tabs、关闭按钮）。

                headerTitleAlign 必须显式写：默认是"iOS 居中、其它平台靠左"。原生栈上看着居中是巧合
                （自定义 title 被塞进左侧容器再包一层 flex:1 撑满），JS 栈老实按 align 摆。 */}
            <Stack.Screen
              name="add"
              options={{ ...ScreenTransitions.push, title: '记一笔', headerTitleAlign: 'center' }}
            />
            <Stack.Screen name="set-budget" options={ScreenTransitions.dialog} />
            {/* 新建/编辑账户跟记一笔同一类：进去做完事再出来，所以同一种 push 转场。
                标题写在路由这一层（页面组件还没渲染的那几帧才不会退回路由名 "Account-editor"），
                「创建/编辑」的区分由页面里那个提交按钮的文字交代 */}
            <Stack.Screen
              name="account-editor"
              options={{ ...ScreenTransitions.push, title: '账户', headerTitleAlign: 'center' }}
            />
            <Stack.Screen name="categories" options={{ ...ScreenTransitions.push, title: '分类管理' }} />
            {/* 跟记一笔、分类管理同一类，用同一个 push。以前空着看不出来是因为原生栈在 Android 上
                会把 slide_from_right 回落成默认；JS 栈照字面执行，不写就分叉成两种动画。 */}
            <Stack.Screen name="tags" options={{ ...ScreenTransitions.push, title: '标签汇总' }} />
            <Stack.Screen
              name="reimbursements"
              options={{ ...ScreenTransitions.push, title: '报销' }}
            />
            {/* 「我的」下面的四个二级页，跟其它二级页同一种转场和同一套标题规则 */}
            <Stack.Screen name="settings/ledger" options={{ ...ScreenTransitions.push, title: '账本' }} />
            <Stack.Screen
              name="settings/home-layout"
              options={{ ...ScreenTransitions.push, title: '首页布局' }}
            />
            <Stack.Screen name="settings/theme" options={{ ...ScreenTransitions.push, title: '主题' }} />
            <Stack.Screen name="settings/other" options={{ ...ScreenTransitions.push, title: '其他' }} />
          </Stack.Protected>
          <Stack.Protected guard={!user}>
            <Stack.Screen name="login" options={ScreenTransitions.crossFade} />
            <Stack.Screen name="register" options={ScreenTransitions.crossFade} />
          </Stack.Protected>
        </Stack>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
