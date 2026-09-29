import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fetchWiseRates, hasWiseToken } from '@/api/wise';
import { BASE_CURRENCY } from '@/constants/currencies';
import { listCachedRates, saveManualRate, saveRates, type CachedRate } from '@/db/exchange-rates';
import { getEnabledCurrencyCodes } from '@/db/settings';

const RATES_KEY = ['exchangeRates'];

/**
 * 缓存多久之后算旧。
 *
 * 十二小时不是精度要求，是**记账场景的要求**：一天之内汇率的波动进不到"500 日元折合多少分"
 * 这一级（日元对林吉特日内波动千分之几，500 日元上是几分钱）。
 * 真正要避免的是另一头——出国玩一周回来，App 还拿着出发前那天的汇率在算账。
 */
const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

export type ExchangeRates = {
  /** 币种代码 → 缓存的那一行。本位币不在里面（它对自己的汇率恒为 1，不需要存） */
  byCode: Record<string, CachedRate>;
  /** 有没有配 Wise token。没配的话界面上要把"刷新"换成"手填" */
  hasToken: boolean;
  /** 这一轮想刷新但失败了的原因。不为 null 时界面上仍然有汇率可用（是缓存里的旧值） */
  refreshError: string | null;
};

/**
 * 汇率。**先给缓存，再在后面偷偷刷新**（stale-while-revalidate）。
 *
 * 顺序很重要：点开选币种页的那一刻必须立刻有数字，哪怕是昨天的。
 * 让那一页转圈等网络，等于把"记一笔账"的时间从两秒拉到十秒，而那两秒正是这个 App 的全部卖点。
 *
 * 拉失败不抛，降级成"用缓存 + 带一句原因"：没网的时候仍然要能记账（CLAUDE.md 原则#1）。
 */
export function useExchangeRates() {
  return useQuery<ExchangeRates>({
    queryKey: RATES_KEY,
    queryFn: async () => {
      const cached = await listCachedRates();
      const token = await hasWiseToken();
      const codes = await getEnabledCurrencyCodes();

      // 只看**启用中的**币种新不新。删掉一个之后它那一行还留在缓存里（见 use-currencies 的说明），
      // 拿它的时间去判断会把"刚加了一个新币种、它一条汇率都没有"这种情况算成"很新"
      const newest = codes.reduce<number>(
        (max, code) => Math.max(max, cached[code] ? new Date(cached[code].fetchedAt).getTime() : 0),
        0,
      );
      // 有启用的币种一条汇率都没有（刚加进来的）→ 立刻拉，不等那 12 小时
      const missing = codes.some((code) => !cached[code]);
      const isStale = missing || Date.now() - newest > STALE_AFTER_MS;

      if (!token || !isStale) return { byCode: cached, hasToken: token, refreshError: null };

      try {
        const fresh = await fetchWiseRates(codes);
        await saveRates(
          Object.entries(fresh).map(([code, perBase]) => ({ code, perBase })),
          'wise',
        );
        return { byCode: await listCachedRates(), hasToken: true, refreshError: null };
      } catch (error) {
        return {
          byCode: cached,
          hasToken: true,
          refreshError: error instanceof Error ? error.message : '拉取汇率失败',
        };
      }
    },
  });
}

/**
 * 手动点「刷新汇率」。跟上面那个自动刷新走的是同一个 fetch，区别只有两点：
 * 不看 STALE_AFTER_MS（用户明确要最新的），失败要**抛出来**（他按了按钮，得看到结果）。
 */
export function useRefreshRates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const fresh = await fetchWiseRates(await getEnabledCurrencyCodes());
      await saveRates(
        Object.entries(fresh).map(([code, perBase]) => ({ code, perBase })),
        'wise',
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: RATES_KEY }),
  });
}

/** 手填一个汇率（没配 token、或者想照着 Wise App 上的数字抄一遍时用） */
export function useSaveManualRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ code, perBase }: { code: string; perBase: number }) => saveManualRate(code, perBase),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: RATES_KEY }),
  });
}

/**
 * 「1 MYR 换得到多少这种钱」。本位币恒为 1，查不到返回 null。
 *
 * 返回 null 而不是兜底成 1：兜底成 1 会让 500 日元被当成 500 林吉特存进去，
 * 而那笔账看起来完全正常——错得越安静越难发现。查不到时界面上该拦着不让存，
 * 让用户先填一个汇率。
 */
export function getPerBaseRate(rates: ExchangeRates | undefined, code: string): number | null {
  if (code === BASE_CURRENCY) return 1;
  return rates?.byCode[code]?.perBase ?? null;
}
