import { Link, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { authScreenStyles as styles } from '@/components/auth/auth-screen.styles';
import { NeedsConnection } from '@/components/auth/needs-connection';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { useHasRemote, useLoginCloudAccount } from '@/hooks/use-cloud';
import { useTheme } from '@/hooks/use-theme';

/**
 * 登录——登的是**用户自己那个 Neon 库里的账号**，不是我的 Express 后端。
 *
 * 备份这条路是手机直连用户自己的库的，所以账号也建在那个库里（见 db/neon/account.ts）。
 * 这一页原来打的是 `/auth/login`，现在改成对着那个库跑 SQL：正式包里根本没有公网后端可连，
 * 而填完连接串之后跳来这里登一个连不上的后端账号说不通。
 * `auth.store` 和 `api/auth.ts` 原样留着，以后真要上线服务端登录时还用得上。
 */
export default function LoginScreen() {
  const theme = useTheme();
  const { data: connected, isLoading } = useHasRemote();
  const login = useLoginCloudAccount();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const canSubmit = !!email.trim() && !!password && !login.isPending;

  const handleSubmit = () => {
    setError(null);
    login.mutate(
      { email, password },
      {
        // dismissAll 而不是 back：这一层上面可能还压着别的（注册页是从登录页再 push 的），
        // back 一次只会退回那张表单。一路收回到底下的 tab，
        // 顺带让「我的」页立刻显示登录后的样子
        onSuccess: () => {
          if (router.canDismiss()) router.dismissAll();
          else router.back();
        },
        onError: (submitError) => setError((submitError as Error).message),
      },
    );
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ThemedView style={styles.container}>
        {isLoading ? (
          <ActivityIndicator color={theme.cardHighlight} />
        ) : !connected ? (
          <NeedsConnection />
        ) : (
          <>
            <ThemedText type="title" style={styles.title}>
              登录账本
            </ThemedText>

            <TextInput
              value={email}
              onChangeText={(next) => {
                setEmail(next);
                setError(null);
              }}
              placeholder="邮箱"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            />
            <TextInput
              value={password}
              onChangeText={(next) => {
                setPassword(next);
                setError(null);
              }}
              placeholder="密码"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              secureTextEntry
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            />

            {error && (
              <ThemedText type="small" style={[styles.error, { color: theme.expense }]}>
                {error}
              </ThemedText>
            )}

            <Pressable
              onPress={handleSubmit}
              disabled={!canSubmit}
              style={[styles.button, { backgroundColor: theme.cardHighlight, opacity: canSubmit ? 1 : 0.5 }]}>
              {login.isPending ? (
                <ActivityIndicator color={theme.onCardHighlight} />
              ) : (
                <ThemedText style={[styles.buttonText, { color: theme.onCardHighlight }]}>登录</ThemedText>
              )}
            </Pressable>

            <Link href="/register" replace style={styles.switchModeButton}>
              <ThemedText type="small" style={[styles.switchModeText, { color: theme.cardHighlight }]}>
                还没有账号？去注册
              </ThemedText>
            </Link>
          </>
        )}
      </ThemedView>
    </SafeAreaView>
  );
}
