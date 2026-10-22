import { useQuery } from '@tanstack/react-query';

import { listEntryDates } from '@/db/transactions';
import { addDays, formatDayKey, startOfDay } from '@/utils/date';

/** 足迹格子画多少周。26 周 ≈ 半年，一行 26 格在手机宽度上每格还有 10 点左右 */
export const FOOTPRINT_WEEKS = 26;

export type EntryFootprint = {
  /** 按列（一列一周、周日在上）排好的格子，最后一列是本周。没到的日子是 null */
  cells: ({ key: string; count: number } | null)[];
  /** 今年有几天记过账 */
  daysThisYear: number;
  /** 到今天（今天还没记就到昨天）为止连续记了几天 */
  streak: number;
  /** 格子里最多的那天记了几笔，用来定深浅 */
  maxCount: number;
};

/**
 * 记账足迹：最近半年每天记了几笔。只有「我的 · 账本样式」在用（见 components/settings/ledger）。
 *
 * queryKey 挂在 `transactions` 底下：记一笔、删一笔之后 invalidateAll 会把它一起刷掉，不用另外登记。
 */
export function useEntryFootprint() {
  const today = startOfDay(new Date());
  // 往回数到 26 周前那一周的周日，这样每一列正好是完整的一周
  const firstDay = addDays(today, -(FOOTPRINT_WEEKS - 1) * 7 - today.getDay());
  const yearStart = new Date(today.getFullYear(), 0, 1);
  const since = firstDay < yearStart ? firstDay : yearStart;

  return useQuery({
    queryKey: ['transactions', 'footprint', formatDayKey(today)],
    queryFn: async (): Promise<EntryFootprint> => {
      const counts = new Map<string, number>();
      for (const iso of await listEntryDates(since)) {
        const key = formatDayKey(new Date(iso));
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }

      const cells: EntryFootprint['cells'] = [];
      let maxCount = 0;
      for (let i = 0; i < FOOTPRINT_WEEKS * 7; i += 1) {
        const day = addDays(firstDay, i);
        if (day > today) {
          cells.push(null);
          continue;
        }
        const key = formatDayKey(day);
        const count = counts.get(key) ?? 0;
        maxCount = Math.max(maxCount, count);
        cells.push({ key, count });
      }

      const daysThisYear = [...counts.keys()].filter((key) => key.startsWith(`${today.getFullYear()}-`)).length;

      // 今天还没记不算断：一天还没过完
      let streak = 0;
      let cursor = counts.has(formatDayKey(today)) ? today : addDays(today, -1);
      while (counts.has(formatDayKey(cursor))) {
        streak += 1;
        cursor = addDays(cursor, -1);
      }

      return { cells, daysThisYear, streak, maxCount };
    },
  });
}
