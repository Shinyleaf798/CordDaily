import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import { HomeLayoutName, HomeLayoutNames, type HomeSlot } from '@/constants/home-layout';

type HomeLayoutState = {
  /** 上半（预算和消费）用哪种画法 */
  top: HomeLayoutName;
  /** 下半（近7天账单）用哪种画法 */
  bills: HomeLayoutName;
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  setSlot: (slot: HomeSlot, name: HomeLayoutName) => Promise<void>;
};

const KEYS: Record<HomeSlot, string> = {
  top: 'homeLayoutTop',
  bills: 'homeLayoutBills',
};

/**
 * 拆成上下两半之前只有这一个 key，存的是"整页用哪套布局"。
 * 老用户的那个值现在当作**两段的共同起点**：他选过金环，就上下都还是金环，
 * 跟这次改动之前看到的一模一样，要拆开是他自己后来的事。
 */
const LEGACY_KEY = 'homeLayout';
const DEFAULT_LAYOUT: HomeLayoutName = 'pace';

const parse = (value: string | null): HomeLayoutName | null =>
  value && HomeLayoutNames.includes(value as HomeLayoutName) ? (value as HomeLayoutName) : null;

// 跟 theme.store 同一套写法（zustand + expo-secure-store），不为了一个偏好项再引入 AsyncStorage。
// 两个 store 拆开而不是合成一个 "preferences"：布局和配色是正交的两件事，
// 合在一起以后加第三个偏好项时只会越来越难拆
export const useHomeLayoutStore = create<HomeLayoutState>((set) => ({
  top: DEFAULT_LAYOUT,
  bills: DEFAULT_LAYOUT,
  isHydrated: false,

  // 存的值已经不是合法布局名时（比如以后删掉某套布局）兜底成默认值，
  // 而不是让首页拿到 undefined 渲染成白屏
  hydrate: async () => {
    try {
      const [savedTop, savedBills, legacy] = await Promise.all([
        SecureStore.getItemAsync(KEYS.top),
        SecureStore.getItemAsync(KEYS.bills),
        SecureStore.getItemAsync(LEGACY_KEY),
      ]);
      const fallback = parse(legacy) ?? DEFAULT_LAYOUT;
      set({
        top: parse(savedTop) ?? fallback,
        bills: parse(savedBills) ?? fallback,
        isHydrated: true,
      });
    } catch (err) {
      console.warn('Failed to hydrate home layout preference, falling back to default', err);
      set({ top: DEFAULT_LAYOUT, bills: DEFAULT_LAYOUT, isHydrated: true });
    }
  },

  setSlot: async (slot, name) => {
    set({ [slot]: name } as Pick<HomeLayoutState, HomeSlot>);
    await SecureStore.setItemAsync(KEYS[slot], name);
  },
}));
