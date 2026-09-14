import { Colors } from '@/constants/theme';
import { useThemeStore } from '@/store/theme.store';

export function useTheme() {
  const themeName = useThemeStore((s) => s.themeName);

  return Colors[themeName];
}
