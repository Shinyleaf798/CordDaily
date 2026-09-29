import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  BASE_CURRENCY,
  CATALOG_FOREIGN,
  getCurrency,
  type Currency,
} from '@/constants/currencies';
import { getEnabledCurrencyCodes, setEnabledCurrencyCodes } from '@/db/settings';

const CURRENCIES_KEY = ['enabledCurrencies'];

export type EnabledCurrencies = {
  /** 记账页选币种列表要列的：本位币排第一，后面是启用的外币 */
  all: Currency[];
  /** 只有外币。要拉汇率的、设置页里能删的，都是这一批 */
  foreign: Currency[];
  /** 目录里还没启用的。添加币种那一页列的就是它 */
  available: Currency[];
};

/**
 * 用户启用了哪几种外币。
 *
 * 三份视图一起给，而不是让每个页面自己从 codes 推：
 * 「本位币要不要排进去」「添加页该排除谁」这两个问题各处的答案必须一样，
 * 分散着写迟早有一处漏掉本位币，于是选币种列表里出现两个 MYR。
 */
export function useEnabledCurrencies() {
  return useQuery<EnabledCurrencies>({
    queryKey: CURRENCIES_KEY,
    queryFn: async () => {
      const codes = await getEnabledCurrencyCodes();
      // 按用户存的顺序，不按目录顺序：新加的排在最后，那是他刚做的动作，应该看得见
      const foreign = codes.map(getCurrency);
      return {
        all: [getCurrency(BASE_CURRENCY), ...foreign],
        foreign,
        available: CATALOG_FOREIGN.filter((c) => !codes.includes(c.code)),
      };
    },
  });
}

/**
 * 加一个 / 删一个。
 *
 * 两个动作共用一个 mutation，因为它们做的是同一件事——**把整份清单写回去**。
 * 拆成 add/remove 两个各自读一遍、改一改、再写回去的函数，就多了一次
 * "两个动作同时发生时后写的覆盖先写的"的机会，而这一页上加和删就挨在一起。
 *
 * 删掉一个币种**不动任何已经记过的账**：那些账里存着自己的 code 和当时的汇率，
 * getCurrency 对目录外的 code 也有兜底（显示成 "SGD 25.50"）。
 * 汇率缓存里那一行也留着——留着不花钱，而重新启用时它立刻就有数可用。
 */
export function useSetEnabledCurrencies() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (codes: string[]) => setEnabledCurrencyCodes(codes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CURRENCIES_KEY });
      // 汇率那份缓存要跟着重算：刚加的币种还没有汇率，得让下一次读触发拉取
      queryClient.invalidateQueries({ queryKey: ['exchangeRates'] });
    },
  });
}
