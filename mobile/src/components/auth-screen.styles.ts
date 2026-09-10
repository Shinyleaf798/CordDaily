import { StyleSheet } from 'react-native';

import { Spacing } from '@/constants/theme';

// login <-> register 之间切换用的动画，在 _layout.tsx 里给两个 Stack.Screen 复用，改这一处两边同时生效
export const authScreenTransition = {
  headerShown: false,
  animation: 'fade' as const,
};

// login.tsx 和 register.tsx 是两个独立页面（而不是同一页面里切换的两种 mode），共享同一套视觉样式
export const authScreenStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  title: {
    textAlign: 'center',
    marginBottom: Spacing.four,
  },
  input: {
    height: 48,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  button: {
    height: 48,
    borderRadius: 12,
    backgroundColor: '#e8891b',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  error: {
    color: '#e5484d',
    textAlign: 'center',
  },
  switchModeButton: {
    marginTop: Spacing.two,
    textAlign: 'center',
  },
  switchModeText: {
    color: '#e8891b',
  },
});
