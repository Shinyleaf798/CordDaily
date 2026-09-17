import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';

import { ScreenTransitions } from '@/constants/screen-transitions';
import { ThemeScheme } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { seedDefaultAccount } from '@/db/accounts';
import { seedDefaultCategories } from '@/db/categories';
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
    seedDefaultCategories().catch(() => {
      // 灌种子失败不该挡住启动：分类页仍然可以手动新建
    });
    seedDefaultAccount().catch(() => {
      // 同上：资产页可以手动新建账户
    });
  }, [hydrateAuth, hydrateTheme, hydrateHomeLayout]);

  useEffect(() => {
    if (isHydrated) {
      SplashScreen.hideAsync();
    }
  }, [isHydrated]);

  /**
   * 根视图底色，跟着主题走。
   *
   * 这不是锦上添花，是转场白屏的唯一解：expo-router 自带的那份 native stack 里，
   * 屏幕一失去焦点，它的内容整块被设成 display:'none'
   * （见 expo-router/build/react-navigation/native-stack/views/NativeStackView.js）。
   * 点返回的那一刻内容瞬间消失，连 contentStyle 那层 View 一起藏掉，
   * 滑走的是一个空的原生 Screen——露出的就是根视图底色。
   * 那个默认值在 Android 上是白，所以黑色主题下会闪一下刺眼的白。
   *
   * 把它设成主题底色，那一帧就变成"一块纯色面板带着 header 滑走"，跟页面本身是同一个色。
   * 内容本身留不住（display:'none' 写在 expo-router 内部，userland 改不了），
   * 但看得见的白屏没有了。
   */
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.background).catch(() => {
      // 设不上只是回到默认底色，不该挡住启动
    });
  }, [theme.background]);

  if (!isHydrated) {
    return null;
  }

  // 导航器自己也有一套颜色：屏幕底色、header 底色、返回箭头、标题文字，全归它管，
  // 而它默认只有 light/dark 两档现成色板，跟这个 App 的三套主题对不上。
  //
  // 后果不只是"header 灰得不太一样"：**屏幕底色是画在原生 Screen 这一层的**，
  // 页面内容没渲染出来的那几帧（转场中、异步取数中）就只剩它。之前那几帧是白的，
  // 因为那时连它都没接上，露出的是 Android 原生窗口底色。
  //
  // 只覆盖颜色，保留 base 的 dark 标记和字体配置——那两样是给系统控件用的，改了没好处。
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
        <Stack>
          <Stack.Protected guard={!!user}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            {/* 记一笔从右滑入、保存后原路滑回右边（见 ScreenTransitions.push 的注释）。
                返回动画不用单独配：slide_from_right 的出场本来就是它的逆过程。

                title 必须写在这里，不能只靠 TransactionForm 里那个 <Stack.Screen>：
                那份 options 跟着组件走，组件不在的那几帧（转场、编辑模式还在查数据）标题会退回
                路由名 "Add"。写在路由这一层的才是这个页面的"底线外观"，
                组件里那份只负责它额外要的东西（收支切换 tabs、关闭按钮）。

                contentStyle 跟上面那个 navigationTheme 是两层：navigationTheme 画的是原生 Screen 的底，
                内容一个都不剩时靠它；contentStyle 画的是包着 children 的那层容器。两层都铺上，
                是因为 children 没了的时候第二层会塌成 0 高度，光靠它兜不住。 */}
            <Stack.Screen
              name="add"
              options={{ ...ScreenTransitions.push, title: '记一笔', contentStyle: { backgroundColor: theme.background } }}
            />
            <Stack.Screen name="set-budget" options={ScreenTransitions.dialog} />
            <Stack.Screen
              name="categories"
              options={{ ...ScreenTransitions.push, title: '分类管理', contentStyle: { backgroundColor: theme.background } }}
            />
            <Stack.Screen name="tags" />
            <Stack.Screen name="reimbursements" />
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
