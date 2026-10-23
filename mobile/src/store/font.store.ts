import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import { FontNames, type FontName } from '@/constants/font';

type FontState = {
  fontName: FontName;
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  setFontName: (name: FontName) => Promise<void>;
};

const KEY = 'fontName';
const DEFAULT_FONT: FontName = 'system';

// 跟 theme.store 一模一样的存法：一个不敏感的偏好，复用 expo-secure-store 不多引一个存储层
export const useFontStore = create<FontState>((set) => ({
  fontName: DEFAULT_FONT,
  isHydrated: false,

  // 存的值不在列表里（以后删了某套字体）就兜底成默认，不让 isHydrated 卡住
  hydrate: async () => {
    try {
      const saved = await SecureStore.getItemAsync(KEY);
      const fontName = FontNames.includes(saved as FontName) ? (saved as FontName) : DEFAULT_FONT;
      set({ fontName, isHydrated: true });
    } catch (err) {
      console.warn('Failed to hydrate font preference, falling back to default', err);
      set({ fontName: DEFAULT_FONT, isHydrated: true });
    }
  },

  setFontName: async (fontName) => {
    set({ fontName });
    await SecureStore.setItemAsync(KEY, fontName);
  },
}));
