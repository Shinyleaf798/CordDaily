import * as SecureStore from 'expo-secure-store';

import { BASE_CURRENCY } from '@/constants/currencies';

/**
 * 从 Wise 拉汇率。
 *
 * **为什么是 Wise 而不是随便一个免费汇率 API**：这个 App 的外币账单基本都是用 Wise 付的，
 * 拿 Wise 自己的中间价填上去，跟 App 里看到的数字对得上，不用再解释"为什么差了几分"。
 * 手续费不算进来——实测那笔钱小到进不了两位小数，为它多存一个字段不值得。
 *
 * **为什么直接从手机打，不经过自己的后端**：记账不需要登录（CLAUDE.md 原则#1），
 * 汇率是记账的一部分，它就不能依赖那条要登录才通的链路。后端也不该多一个转发职责（原则#6）。
 * 代价是 token 得存在手机上——存 SecureStore，跟 Neon 连接串同一个待遇，
 * 而且**绝不进备份包**（那个文件用户会往聊天窗口里丢）。
 *
 * **token 是可选的**：没配也能选外币记账，汇率那一栏改成手填（见 db/exchange-rates.ts 的 manual）。
 * 把汇率做成"必须联网才能记这笔账"就是把本地优先这条原则从记账页上挖掉一个洞。
 */

const TOKEN_KEY = 'wiseApiToken';

// 官方域名。老文档里的 api.transferwise.com 仍然解析到同一套服务（实测两个都通），
// 但文档只写 api.wise.com，跟着新的走
const RATES_URL = 'https://api.wise.com/v1/rates';

let cachedToken: string | null | undefined;

export async function getWiseToken(): Promise<string | null> {
  if (cachedToken !== undefined) return cachedToken;
  cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
  return cachedToken;
}

export async function hasWiseToken(): Promise<boolean> {
  return !!(await getWiseToken());
}

export async function saveWiseToken(token: string): Promise<void> {
  const trimmed = token.trim();
  await SecureStore.setItemAsync(TOKEN_KEY, trimmed);
  cachedToken = trimmed;
}

export async function clearWiseToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  cachedToken = null;
}

/**
 * 粘进来的东西**看起来**像不像一个 token。返回问题描述，没问题返回 null。
 *
 * 只挡明显粘错的（空的、带空格换行的、整条网址），**不校验格式**：
 * 实测拿到的是一个 UUID，但文档把它描述成 JWT，两种长得完全不一样。
 * 卡死一种格式的代价是哪天 Wise 换了发号方式，用户会撞在一句"格式不对"上，
 * 而那句话是错的。真正的验证是下面 verifyWiseToken 那一发请求——
 * 这里只是省掉一次必然失败的网络往返。
 */
export function checkWiseToken(value: string): { message: string } | null {
  const trimmed = value.trim();
  if (!trimmed) return { message: '还没粘东西进来' };
  if (/\s/.test(trimmed)) return { message: '中间有空格或换行，可能多复制了一截' };
  if (/^https?:\/\//i.test(trimmed)) return { message: '这是一条网址，要的是 API tokens 页面上那串字符' };
  return null;
}

type WiseRate = {
  rate: number;
  source: string;
  target: string;
  time: string;
};

/**
 * 一次把全部外币的汇率拉回来，返回「币种代码 → 1 MYR 换得到多少」。
 *
 * **先一发 `?source=MYR`，缺哪个再按币种对补一发。**
 *
 * `?source=X` 这个形式没出现在 Wise 文档的示例列表里（那里只有"不带参数拿全部"和
 * "source+target 拿一对"两种），所以一度改成了照文档走。实测之后改回来——三种写法量过：
 *
 *   GET /rates                  → 26714 条，2,186,303 bytes，1.23s
 *   GET /rates?source=MYR       → 163 条，  13,237 bytes，  0.28s
 *   GET /rates?source=MYR&target=JPY → 1 条，     82 bytes，  0.29s
 *
 * 为了几个数字在手机流量上拉 2 MB，是文档措辞换不来的代价。**小 165 倍。**
 *
 * 也没有反过来做成"每个币种单独问一发"（那样总共才几百字节）：清单里几种货币就是几个
 * 往返，而 13 KB 在任何网络上都不值得为它多排队——何况还有 429 限流盯着。
 *
 * 补漏那一步走的是文档里写明的 source+target，所以即使哪天 `?source=X` 不返回了，
 * 坏的也只是"这一次按币种各发一发"，功能本身不会塌——而这整件事一天最多跑一次。
 *
 * 拿不到 token 直接抛：调用方（use-exchange-rates）会把这个失败降级成"继续用缓存里的旧汇率"，
 * 而不是让选币种页空着。
 */
export async function fetchWiseRates(codes: string[]): Promise<Record<string, number>> {
  const token = await getWiseToken();
  if (!token) throw new Error('还没填 Wise API token');
  return fetchRatesWith(token, codes);
}

/**
 * 拿一个**还没存下来**的 token 试一发。
 *
 * 存之前先验证，跟 Neon 那条连接串一个做法（见 app/settings/cloud.tsx 的 handleConnect）：
 * 存了个用不了的 token，界面会显示"已连上"，然后每次刷新都静默失败——
 * 那比一开始就说"这个 token 不行"糟糕得多。
 *
 * 成功时顺手把汇率一起返回，调用方可以直接存下来，不用紧接着再拉一次。
 */
export async function verifyWiseToken(token: string, codes: string[]): Promise<Record<string, number>> {
  return fetchRatesWith(token.trim(), codes);
}

/**
 * `codes` 是**用户启用的那几个外币**（见 db/settings.ts 的 getEnabledCurrencyCodes），
 * 由调用方传进来而不是在这一层去读库：这个模块只管"怎么跟 Wise 说话"，
 * "要问哪几种钱"是上面那层的事。
 */
async function fetchRatesWith(token: string, codes: string[]): Promise<Record<string, number>> {
  const wanted = codes.filter((code) => code !== BASE_CURRENCY);
  const rates: Record<string, number> = {};

  // 一个外币都没启用就别发请求了——那一发拿回来的东西一条都用不上
  if (wanted.length === 0) return rates;

  // 第一发：MYR 能换到的全部币种（实测 163 条 / 13 KB），筛出启用清单里的那几个
  const all = await requestRates(token, { source: BASE_CURRENCY });
  for (const item of all) {
    if (wanted.includes(item.target) && item.source === BASE_CURRENCY) rates[item.target] = item.rate;
  }

  // 补漏：上面那发没覆盖到的，一个一个问。全都拿到了就一发都不用补
  const missing = wanted.filter((code) => rates[code] === undefined);
  const filled = await Promise.all(
    missing.map(async (code) => {
      try {
        const [item] = await requestRates(token, { source: BASE_CURRENCY, target: code });
        return item ? ([code, item.rate] as const) : null;
      } catch {
        // 单个币种拉不到不该让整批失败——拿到几个算几个，剩下的沿用缓存里的旧值
        return null;
      }
    }),
  );
  for (const entry of filled) {
    if (entry) rates[entry[0]] = entry[1];
  }

  if (Object.keys(rates).length === 0) throw new Error('Wise 没有返回任何汇率');
  return rates;
}

async function requestRates(token: string, params: { source?: string; target?: string }): Promise<WiseRate[]> {
  const query = new URLSearchParams(params).toString();
  const response = await fetch(query ? `${RATES_URL}?${query}` : RATES_URL, {
    headers: { Authorization: `Bearer ${token}` },
  });

  // 401 单独说一句：这是唯一一个用户自己能修的错误（token 填错了或者过期了），
  // 其余的（超时、5xx）用户除了等没有别的办法，没必要区分
  if (response.status === 401 || response.status === 403) {
    throw new Error('Wise token 无效或已过期，去「我的 → 货币汇率」重新填一次');
  }
  // 429 是唯一一个"等一会儿就好"的错误，而且 Wise 会告诉你等多久。
  // 不在这里自动重试：这一层的调用者是"用户点了刷新"或"打开 App 时顺手拉一次"，
  // 两种情况下悄悄等上几秒都不如直接说清楚——反正缓存里的旧汇率一直是可用的
  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    throw new Error(`Wise 限流了${retryAfter ? `，${retryAfter} 秒后再试` : '，过一会儿再试'}`);
  }
  if (!response.ok) {
    throw new Error(`Wise 汇率接口返回 ${response.status}`);
  }

  const body = (await response.json()) as WiseRate[] | WiseRate;
  // 文档说返回的是数组（"List of exchange rate values"），但带 target 只会有一项，
  // 谁也不保证哪天不会退化成单个对象——一律折成数组处理，多一行的事
  return Array.isArray(body) ? body : [body];
}
