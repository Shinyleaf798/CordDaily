import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { ThemeScheme } from '@/constants/theme';
import { seedDefaultCategories } from '@/db/categories';
import { useAuthStore } from '@/store/auth.store';
import { useHomeLayoutStore } from '@/store/home-layout.store';
import { useThemeStore } from '@/store/theme.store';
import { authScreenTransition } from '@/components/auth/auth-screen.styles';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

export default function RootLayout() {
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
    // 首次启动灌默认分类。放在这里而不是 db/client.ts 的 getDb 里，是因为 categories.ts 要 import getDb，
    // 反过来让 client.ts import categories.ts 会形成循环依赖
    seedDefaultCategories().catch(() => {
      // 灌种子失败不该挡住启动：分类页仍然可以手动新建
    });
  }, [hydrateAuth, hydrateTheme, hydrateHomeLayout]);

  useEffect(() => {
    if (isHydrated) {
      SplashScreen.hideAsync();
    }
  }, [isHydrated]);

  if (!isHydrated) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={ThemeScheme[themeName] === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Protected guard={!!user}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="add" options={{ presentation: 'modal' }} />
            <Stack.Screen name="budgets" />
            <Stack.Screen name="tags" />
            <Stack.Screen name="reimbursements" />
          </Stack.Protected>
          <Stack.Protected guard={!user}>
            <Stack.Screen name="login" options={authScreenTransition} />
            <Stack.Screen name="register" options={authScreenTransition} />
          </Stack.Protected>
        </Stack>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
