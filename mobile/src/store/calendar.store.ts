import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import { CalendarLayoutNames, type CalendarLayoutName, type CalendarSlot } from '@/constants/calendar-layout';

/**
 * 日历页上下两段各用哪种画法。跟 home.store 同一套写法，但不合进去：
 * 两页的段不一样（日历没有「账单看多长」），合成一个 store 只会多出一堆"这个 key 是哪页的"
 */
type CalendarState = {
  top: CalendarLayoutName;
  day: CalendarLayoutName;
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  setSlot: (slot: CalendarSlot, name: CalendarLayoutName) => Promise<void>;
};

const KEYS: Record<CalendarSlot, string> = {
  top: 'calendarLayoutTop',
  day: 'calendarLayoutDay',
};
// 默认是经典：这是加热力之前日历一直的样子，老用户更新后看到的不该变
const DEFAULT_LAYOUT: CalendarLayoutName = 'classic';

const parseLayout = (value: string | null): CalendarLayoutName | null =>
  value && CalendarLayoutNames.includes(value as CalendarLayoutName) ? (value as CalendarLayoutName) : null;

export const useCalendarStore = create<CalendarState>((set) => ({
  top: DEFAULT_LAYOUT,
  day: DEFAULT_LAYOUT,
  isHydrated: false,

  hydrate: async () => {
    try {
      const [savedTop, savedDay] = await Promise.all([
        SecureStore.getItemAsync(KEYS.top),
        SecureStore.getItemAsync(KEYS.day),
      ]);
      set({
        top: parseLayout(savedTop) ?? DEFAULT_LAYOUT,
        day: parseLayout(savedDay) ?? DEFAULT_LAYOUT,
        isHydrated: true,
      });
    } catch (err) {
      console.warn('Failed to hydrate calendar preferences, falling back to defaults', err);
      set({ top: DEFAULT_LAYOUT, day: DEFAULT_LAYOUT, isHydrated: true });
    }
  },

  setSlot: async (slot, name) => {
    set({ [slot]: name } as Pick<CalendarState, CalendarSlot>);
    await SecureStore.setItemAsync(KEYS[slot], name);
  },
}));
