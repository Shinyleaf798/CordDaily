import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import { HomeLayoutName, HomeLayoutNames } from '@/constants/home-layout';

type HomeLayoutState = {
  layoutName: HomeLayoutName;
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  setLayoutName: (name: HomeLayoutName) => Promise<void>;
};

const KEY = 'homeLayout';
const DEFAULT_LAYOUT: HomeLayoutName = 'pace';

// 跟 theme.store 同一套写法（zustand + expo-secure-store），不为了一个偏好项再引入 AsyncStorage。
// 两个 store 拆开而不是合成一个 "preferences"：布局和配色是正交的两件事，
// 合在一起以后加第三个偏好项时只会越来越难拆
export const useHomeLayoutStore = create<HomeLayoutState>((set) => ({
  layoutName: DEFAULT_LAYOUT,
  isHydrated: false,

  // 存的值已经不是合法布局名时（比如以后删掉某套布局）兜底成默认值，
  // 而不是让首页拿到 undefined 渲染成白屏
  hydrate: async () => {
    try {
      const saved = await SecureStore.getItemAsync(KEY);
      const layoutName = saved && HomeLayoutNames.includes(saved as HomeLayoutName)
        ? (saved as HomeLayoutName)
        : DEFAULT_LAYOUT;
      set({ layoutName, isHydrated: true });
    } catch (err) {
      console.warn('Failed to hydrate home layout preference, falling back to default', err);
      set({ layoutName: DEFAULT_LAYOUT, isHydrated: true });
    }
  },

  setLayoutName: async (layoutName) => {
    set({ layoutName });
    await SecureStore.setItemAsync(KEY, layoutName);
  },
}));
