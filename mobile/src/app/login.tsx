import { Link } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import * as authApi from '@/api/auth';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/store/auth.store';
import { authScreenStyles as styles } from '@/components/auth-screen.styles';

export default function LoginScreen() {
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
      const session = await authApi.login(email.trim(), password);
      await setSession(session);
    } catch (err: any) {
      setError(err?.response?.data?.error?.message ?? 'Login failed, please try again');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ThemedView style={styles.container}>
        <ThemedText type="title" style={styles.title}>
          CordDaily
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
          placeholder="Password"
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
          disabled={isSubmitting || !email || !password}
          style={[styles.button, { backgroundColor: theme.accent, opacity: isSubmitting || !email || !password ? 0.5 : 1 }]}>
          {isSubmitting ? (
            <ActivityIndicator color={theme.onAccent} />
          ) : (
            <ThemedText style={[styles.buttonText, { color: theme.onAccent }]}>Log in</ThemedText>
          )}
        </Pressable>

        <Link href="/register" style={styles.switchModeButton}>
          <ThemedText type="small" style={[styles.switchModeText, { color: theme.accent }]}>
            Don&apos;t have an account? Sign up
          </ThemedText>
        </Link>
      </ThemedView>
    </SafeAreaView>
  );
}
