import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { ThemeScheme } from '@/constants/theme';
import { useAuthStore } from '@/store/auth.store';
import { useThemeStore } from '@/store/theme.store';
import { authScreenTransition } from '@/components/auth-screen.styles';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

export default function RootLayout() {
  const isAuthHydrated = useAuthStore((s) => s.isHydrated);
  const user = useAuthStore((s) => s.user);
  const hydrateAuth = useAuthStore((s) => s.hydrate);

  const isThemeHydrated = useThemeStore((s) => s.isHydrated);
  const themeName = useThemeStore((s) => s.themeName);
  const hydrateTheme = useThemeStore((s) => s.hydrate);

  const isHydrated = isAuthHydrated && isThemeHydrated;

  useEffect(() => {
    hydrateAuth();
    hydrateTheme();
  }, [hydrateAuth, hydrateTheme]);

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
