import { Link, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { authScreenStyles as styles } from '@/components/auth/auth-screen.styles';
import { NeedsConnection } from '@/components/auth/needs-connection';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { useAccountProbe, useClaimLegacyBook, useHasRemote, useRegisterCloudAccount } from '@/hooks/use-cloud';
import { useTheme } from '@/hooks/use-theme';

/**
 * 注册——在**用户自己那个 Neon 库里**开一本账（理由见 login.tsx 的文件头）。
 *
 * 这一页有个第二形态：**认领**。上一版 App 连过的库里有一行自动建的占位 `User`，
 * 名下挂着已经推上去的账单。对着那种库按"注册"会开出第二本空账，而原来那些看着像丢了。
 * 所以先探一下库（`useAccountProbe`），发现占位行就把这一页整个换成认领——
 * 同一张表单，但提交时走的是「给那一行补上邮箱密码」，id 原地不动。
 */
export default function RegisterScreen() {
  const theme = useTheme();
  const { data: connected, isLoading: loadingRemote } = useHasRemote();
  const { data: probe, isLoading: probing } = useAccountProbe(!!connected);
  const register = useRegisterCloudAccount();
  const claim = useClaimLegacyBook();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isClaiming = !!probe?.legacyId;
  const mutation = isClaiming ? claim : register;
  const canSubmit = !!email.trim() && password.length >= 8 && !mutation.isPending;

  const handleSubmit = () => {
    setError(null);
    mutation.mutate(
      { email, password },
      {
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
        {loadingRemote || (connected && probing) ? (
          <ActivityIndicator color={theme.cardHighlight} />
        ) : !connected ? (
          <NeedsConnection />
        ) : (
          <>
            <ThemedText type="title" style={styles.title}>
              {isClaiming ? '给旧账本设个密码' : '开一本账'}
            </ThemedText>

            <ThemedText type="small" themeColor="textSecondary" style={styles.error}>
              {isClaiming
                ? `这个库是上一版 App 连过的，里面那本账有 ${probe?.legacyTransactions ?? 0} 笔记录。设完密码就能继续用，账单一条都不会动。`
                : '邮箱和密码只写进你自己那个库，不发给任何人。密码忘了没有找回，但连接串还在的话数据不会丢。'}
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
              placeholder="密码（至少 8 位）"
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
              {mutation.isPending ? (
                <ActivityIndicator color={theme.onCardHighlight} />
              ) : (
                <ThemedText style={[styles.buttonText, { color: theme.onCardHighlight }]}>
                  {isClaiming ? '认领这本账' : '注册'}
                </ThemedText>
              )}
            </Pressable>

            <Link href="/login" replace style={styles.switchModeButton}>
              <ThemedText type="small" style={[styles.switchModeText, { color: theme.cardHighlight }]}>
                已经有账号了？去登录
              </ThemedText>
            </Link>
          </>
        )}
      </ThemedView>
    </SafeAreaView>
  );
}
