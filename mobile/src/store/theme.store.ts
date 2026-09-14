import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import { Colors, ThemeName } from '@/constants/theme';

type ThemeState = {
  themeName: ThemeName;
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  setThemeName: (name: ThemeName) => Promise<void>;
};

const KEY = 'themeName';
const DEFAULT_THEME: ThemeName = 'whiteColorful';

// 主题偏好不是敏感数据，但复用 expo-secure-store 而不是引入 AsyncStorage 依赖，
// 跟 auth.store 保持同一套持久化方式，避免多一个存储层
export const useThemeStore = create<ThemeState>((set) => ({
  themeName: DEFAULT_THEME,
  isHydrated: false,

  // 读取失败或存的值已经不是合法主题名（比如以后改了主题列表）时兜底成默认主题，
  // 而不是让 isHydrated 卡住或者 useTheme() 拿到 undefined 色板
  hydrate: async () => {
    try {
      const saved = await SecureStore.getItemAsync(KEY);
      const themeName = saved && saved in Colors ? (saved as ThemeName) : DEFAULT_THEME;
      set({ themeName, isHydrated: true });
    } catch (err) {
      console.warn('Failed to hydrate theme preference, falling back to default', err);
      set({ themeName: DEFAULT_THEME, isHydrated: true });
    }
  },

  setThemeName: async (themeName) => {
    set({ themeName });
    await SecureStore.setItemAsync(KEY, themeName);
  },
}));
