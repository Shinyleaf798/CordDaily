import { Link, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import * as authApi from '@/api/auth';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/store/auth.store';
import { authScreenStyles as styles } from '@/components/auth/auth-screen.styles';

export default function RegisterScreen() {
  const theme = useTheme();
  const setSession = useAuthStore((s) => s.setSession);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      const session = await authApi.register(email.trim(), password);
      await setSession(session);
      // 原来这里什么都不用做：那道 Stack.Protected 的门会自己换屏。
      // 现在登录只是一个普通的二级页，成功之后得自己走人。
      //
      // dismissAll 而不是 back：这一层上面可能还压着别的（注册页是从登录页再 push 的），
      // back 一次只会退回那张表单。一路收回到底下的 tab，顺带让「我的」页立刻显示登录后的样子
      if (router.canDismiss()) router.dismissAll();
      else router.back();
    } catch (err: any) {
      setError(err?.response?.data?.error?.message ?? 'Registration failed, please try again');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ThemedView style={styles.container}>
        <ThemedText type="title" style={styles.title}>
          Create account
        </ThemedText>

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          keyboardType="email-address"
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password (min 8 characters)"
          placeholderTextColor={theme.textSecondary}
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
          disabled={isSubmitting || !email || password.length < 8}
          style={[styles.button, { backgroundColor: theme.cardHighlight, opacity: isSubmitting || !email || password.length < 8 ? 0.5 : 1 }]}>
          {isSubmitting ? (
            <ActivityIndicator color={theme.onCardHighlight} />
          ) : (
            <ThemedText style={[styles.buttonText, { color: theme.onCardHighlight }]}>Sign up</ThemedText>
          )}
        </Pressable>

        <Link href="/login" style={styles.switchModeButton}>
          <ThemedText type="small" style={[styles.switchModeText, { color: theme.cardHighlight }]}>
            Already have an account? Log in
          </ThemedText>
        </Link>
      </ThemedView>
    </SafeAreaView>
  );
}
