import { StyleSheet } from 'react-native';

import { ScreenPadding, Spacing } from '@/constants/theme';

// login.tsx 和 register.tsx 是两个独立页面（而不是同一页面里切换的两种 mode），共享同一套视觉样式
export const authScreenStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: ScreenPadding,
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
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
  buttonText: {
    fontWeight: '600',
  },
  error: {
    textAlign: 'center',
  },
  switchModeButton: {
    marginTop: Spacing.two,
    textAlign: 'center',
  },
  switchModeText: {},
});
