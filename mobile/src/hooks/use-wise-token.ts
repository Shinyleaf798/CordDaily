import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { clearWiseToken, getWiseToken, saveWiseToken, verifyWiseToken } from '@/api/wise';
import { saveRates } from '@/db/exchange-rates';
import { getEnabledCurrencyCodes } from '@/db/settings';

const TOKEN_KEY = ['wiseToken'];
const RATES_KEY = ['exchangeRates'];

/**
 * 有没有配 Wise token（以及那串东西本身）。
 *
 * 包成 React Query 而不是直接在页面里 await：**改完 token 之后，
 * 选币种弹层里那个刷新按钮要立刻跟着出现或消失**，而那是另一棵组件树。
 * 走同一份缓存，两处才不会各说各话。
 */
export function useWiseToken() {
  return useQuery({ queryKey: TOKEN_KEY, queryFn: getWiseToken });
}

/**
 * 连上 Wise：**先拿这个 token 真打一发，通了才存**。
 *
 * 跟 Neon 那条连接串同一个做法（app/settings/cloud.tsx 的 handleConnect）。
 * 先存后验的话，界面会显示"已连上"而每次刷新都在静默失败——
 * 用户要过很久才会发现汇率停在某一天，而那时候已经记了一堆按旧汇率折算的账。
 *
 * 那一发请求返回的汇率**顺手存下来**，不再单独拉第二次：验证和首次拉取本来就是同一件事。
 */
export function useConnectWise() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (token: string) => {
      const rates = await verifyWiseToken(token, await getEnabledCurrencyCodes());
      await saveWiseToken(token);
      await saveRates(
        Object.entries(rates).map(([code, perBase]) => ({ code, perBase })),
        'wise',
      );
      return rates;
    },
    onSuccess: () => invalidate(queryClient),
  });
}

/** 断开：只删这台手机上存的 token。汇率缓存留着——没有 token 也照样能看能手填 */
export function useDisconnectWise() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: clearWiseToken,
    onSuccess: () => invalidate(queryClient),
  });
}

// token 变了，汇率那份缓存里存着的 hasToken 也得跟着重算——
// 不然刚填完 token，选币种页上的刷新键还要等下一次挂载才出现
function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: TOKEN_KEY });
  queryClient.invalidateQueries({ queryKey: RATES_KEY });
}
