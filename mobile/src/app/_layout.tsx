import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router/js-stack';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { LogBox } from 'react-native';

import { RestorePrompt } from '@/components/settings/restore-prompt';
import { ScreenTransitions } from '@/constants/screen-transitions';
import { ThemeScheme } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { seedDefaultAccounts } from '@/db/accounts';
import { seedDefaultCategories, seedDefaultSubcategories } from '@/db/categories';
import { maybeAutoSync } from '@/db/sync';
import { useAuthStore } from '@/store/auth.store';
import { useHomeLayoutStore } from '@/store/home-layout.store';
import { useThemeStore } from '@/store/theme.store';

/**
 * 压掉一条**库里发出来、我们改不了**的过期警告。
 *
 * 出处：`expo-router/build/react-navigation/stack/views/Stack/Card.js:87,92`——
 * expo-router 内置的那份 `@react-navigation/stack` 卡片转场，在转场开始时用
 * `InteractionManager.createInteractionHandle()` 告诉 RN"有动画在跑，后台任务先等等"。
 * RN 把这套 API 标成了过期，推荐换 `requestIdleCallback`。
 * 也就是说它是 2026-09-17 那条"改用 JS 栈"的直接副产品（那次是为了修 pop 时滑走一个空壳）。
 *
 * **只是 deprecation 警告，行为没变**，而且拉了 57.x 最新的 57.0.23 解包看过，同样两处还在，
 * 所以升级也躲不掉；patch-package 改 node_modules 则是为一条警告去维护一份转场动画的私货分支。
 *
 * 匹配串写得**尽量长**：`ignoreLogs` 是按子串匹配的，只写 "InteractionManager"
 * 会把以后任何一条提到它的消息一起吃掉——包括真该处理的那种。
 *
 * **expo-router 哪天换掉了这个调用，这三行就该删**。判断方法：注释掉之后启动 App，
 * 控制台不再出现这条警告，就说明上游修了。
 */
LogBox.ignoreLogs(['InteractionManager has been deprecated and will be removed in a future release']);

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

  // 自动同步就挂在这里：App 打开时检查一次「上次备份过去多久了」，够了就把没备份的推上去。
  // 不跑后台任务——跟周期交易的补生成同一个时机（CLAUDE.md 原则#1/#4）。
  //
  // 要等 user 有值：没登录时推了也是 401。里面自己吞掉所有失败（记进 lastSyncError），
  // 所以这里不用 catch——拦住启动是不能接受的。
  useEffect(() => {
    if (isHydrated && user) void maybeAutoSync();
  }, [isHydrated, user]);

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
        {/* 没有 Stack.Protected 了：**不登录也能记账**。
            本地 SQLite 本来就是唯一的录入源头（CLAUDE.md 原则#1），登录只为一件事——
            把账推到云端。为了一个可选功能把整个 App 挡在登录页后面，是本末倒置。
            登录/注册从「我的 → 账号」进，跟其它二级页一样 push 进来。 */}
        <Stack>
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
            {/* 首页标题右边那个饼图。**搜索不在这里**——它不是一个地方，是首页上就地展开的一层
                （见 components/search/search-overlay）。
                这一页自己画顶栏（返回 + 总/年/月/周 分段控件 + 排序），所以导航栏整条关掉；
                关在路由这一层而不是页面里，页面组件还没渲染的那几帧才不会先闪一条 header 出来。 */}
            <Stack.Screen name="bill-overview" options={{ ...ScreenTransitions.push, headerShown: false }} />
            <Stack.Screen name="set-budget" options={ScreenTransitions.dialog} />
            {/* 新建/编辑账户跟记一笔同一类：进去做完事再出来，所以同一种 push 转场。
                标题写在路由这一层（页面组件还没渲染的那几帧才不会退回路由名 "Account-editor"），
                「创建/编辑」的区分由页面里那个提交按钮的文字交代 */}
            <Stack.Screen
              name="account-editor"
              options={{ ...ScreenTransitions.push, title: '账户', headerTitleAlign: 'center' }}
            />
            {/* 标题留空：这一页的 header 正中间放的是收支切换 tabs（见 categories.tsx），
                写个「分类管理」在那儿会跟 tabs 抢同一个位置。
                空串而不是干脆不写——不写的话组件还没渲染的那几帧会退回路由名 "Categories"
                （同 add 那条注释说的那件事，只是这里宁可空着也不要一个会被顶掉的标题） */}
            <Stack.Screen
              name="categories"
              options={{ ...ScreenTransitions.push, title: '', headerTitleAlign: 'center' }}
            />
            {/* 分类管理的下一级：某个一级分类底下那几条子分类的顺序。
                标题写在页面里（要带上父分类的名字），这里只给个组件还没渲染时的兜底 */}
            <Stack.Screen
              name="subcategory-order"
              options={{ ...ScreenTransitions.push, title: '子分类', headerTitleAlign: 'center' }}
            />
            {/* 跟记一笔、分类管理同一类，用同一个 push。以前空着看不出来是因为原生栈在 Android 上
                会把 slide_from_right 回落成默认；JS 栈照字面执行，不写就分叉成两种动画。 */}
            <Stack.Screen name="tags" options={{ ...ScreenTransitions.push, title: '标签汇总' }} />
            <Stack.Screen
              name="reimbursements"
              options={{ ...ScreenTransitions.push, title: '报销' }}
            />
            {/* 「我的」下面的二级页，跟其它二级页同一种转场和同一套标题规则。
                原来的 settings/ledger 和 settings/other 删掉了：那两页各自只是转发几条，
                现在「我的」页的功能网格直通目的地（见 components/settings/feature-grid.tsx） */}
            <Stack.Screen
              name="settings/home-layout"
              options={{ ...ScreenTransitions.push, title: '首页布局' }}
            />
            <Stack.Screen name="settings/theme" options={{ ...ScreenTransitions.push, title: '主题' }} />
            <Stack.Screen name="settings/account" options={{ ...ScreenTransitions.push, title: '账号' }} />
            <Stack.Screen name="settings/auto-sync" options={{ ...ScreenTransitions.push, title: '自动同步' }} />
            <Stack.Screen name="settings/about" options={{ ...ScreenTransitions.push, title: '关于' }} />
            <Stack.Screen name="login" options={{ ...ScreenTransitions.push, title: '登录' }} />
            <Stack.Screen name="register" options={{ ...ScreenTransitions.push, title: '注册' }} />
        </Stack>

        {/* 挂在 Stack 外面：它是一层盖在任何页面之上的问句，不属于任何一个路由。
            三个条件同时成立时才出现（登录了 + 本地空库 + 云端有账），平时它 return null */}
        <RestorePrompt />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
