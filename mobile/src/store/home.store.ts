import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import { HomeLayoutName, HomeLayoutNames, type HomeSlot } from '@/constants/home-layout';
import { HomeRange, HomeRanges } from '@/constants/home-range';

/**
 * 首页的显示偏好：上下两段各用哪种画法、账单列表看多长一段。
 *
 * 跟配色（theme.store）拆开，但这三个值放在一起：它们都是"首页长什么样"的一部分，
 * 都在同一个页面（我的 → 首页 / 首页底部那颗「编辑」）里改。
 * 文件原来叫 home-layout.store，加进「看多长一段」之后名字就不准了，所以改名 home.store。
 */
type HomeState = {
  /** 上半（预算和消费）用哪种画法 */
  top: HomeLayoutName;
  /** 下半（近7天账单）用哪种画法 */
  bills: HomeLayoutName;
  /** 账单列表看多长一段 */
  range: HomeRange;
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  setSlot: (slot: HomeSlot, name: HomeLayoutName) => Promise<void>;
  setRange: (range: HomeRange) => Promise<void>;
};

const KEYS: Record<HomeSlot, string> = {
  top: 'homeLayoutTop',
  bills: 'homeLayoutBills',
};
const RANGE_KEY = 'homeRange';

/**
 * 拆成上下两半之前只有这一个 key，存的是"整页用哪套布局"。
 * 老用户的那个值现在当作**两段的共同起点**：他选过金环，就上下都还是金环，
 * 跟这次改动之前看到的一模一样，要拆开是他自己后来的事。
 */
const LEGACY_KEY = 'homeLayout';
const DEFAULT_LAYOUT: HomeLayoutName = 'pace';
// 默认仍然是 7 天：「全部」那一档在账多了之后会一次性查出上千行（见 constants/home-range）
const DEFAULT_RANGE: HomeRange = 'd7';

const parseLayout = (value: string | null): HomeLayoutName | null =>
  value && HomeLayoutNames.includes(value as HomeLayoutName) ? (value as HomeLayoutName) : null;

const parseRange = (value: string | null): HomeRange | null =>
  value && HomeRanges.includes(value as HomeRange) ? (value as HomeRange) : null;

// 跟 theme.store 同一套写法（zustand + expo-secure-store），不为了偏好项再引入 AsyncStorage。
// 两个 store 拆开而不是合成一个 "preferences"：首页长相和配色是正交的两件事，
// 合在一起以后加第三类偏好时只会越来越难拆
export const useHomeStore = create<HomeState>((set) => ({
  top: DEFAULT_LAYOUT,
  bills: DEFAULT_LAYOUT,
  range: DEFAULT_RANGE,
  isHydrated: false,

  // 存的值已经不是合法取值时（比如以后删掉某套画法）兜底成默认值，
  // 而不是让首页拿到 undefined 渲染成白屏
  hydrate: async () => {
    try {
      const [savedTop, savedBills, savedRange, legacy] = await Promise.all([
        SecureStore.getItemAsync(KEYS.top),
        SecureStore.getItemAsync(KEYS.bills),
        SecureStore.getItemAsync(RANGE_KEY),
        SecureStore.getItemAsync(LEGACY_KEY),
      ]);
      const fallback = parseLayout(legacy) ?? DEFAULT_LAYOUT;
      set({
        top: parseLayout(savedTop) ?? fallback,
        bills: parseLayout(savedBills) ?? fallback,
        range: parseRange(savedRange) ?? DEFAULT_RANGE,
        isHydrated: true,
      });
    } catch (err) {
      console.warn('Failed to hydrate home preferences, falling back to defaults', err);
      set({ top: DEFAULT_LAYOUT, bills: DEFAULT_LAYOUT, range: DEFAULT_RANGE, isHydrated: true });
    }
  },

  setSlot: async (slot, name) => {
    set({ [slot]: name } as Pick<HomeState, HomeSlot>);
    await SecureStore.setItemAsync(KEYS[slot], name);
  },

  setRange: async (range) => {
    set({ range });
    await SecureStore.setItemAsync(RANGE_KEY, range);
  },
}));
