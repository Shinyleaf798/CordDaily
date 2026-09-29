import { getDb } from './client';

/**
 * 汇率缓存的读写口子（表定义见 db/schema.ts 的 v13）。
 *
 * 全表只有「1 MYR 换得到多少外币」这一个方向，跟 Wise 的返回和选币种页上显示的数字一致
 * （`source=MYR&target=JPY` 给的就是 38.53 这种数）。**存进账单的那个 exchangeRate 是它的倒数**，
 * 因为账单那边的口径固定是 `amountInBase = amount × exchangeRate`——
 * 两个方向只在 toBaseRate 这一个函数里换算，别处一律不许自己写 `1 /`。
 */

export type RateSource = 'wise' | 'manual';

export type CachedRate = {
  code: string;
  /** 1 MYR = perBase 个这种钱 */
  perBase: number;
  fetchedAt: string;
  source: RateSource;
};

/** 全部缓存的汇率，按币种代码索引。选币种页一次全要，没必要按 code 一条条查 */
export async function listCachedRates(): Promise<Record<string, CachedRate>> {
  const db = await getDb();
  const rows = await db.getAllAsync<CachedRate>('SELECT code, perBase, fetchedAt, source FROM exchange_rates');
  return Object.fromEntries(rows.map((row) => [row.code, row]));
}

/**
 * 写一批拉回来的汇率。
 *
 * `INSERT OR REPLACE` 而不是先查再决定：这批数据整体来自同一次请求、同一个时刻，
 * 逐条比对"比缓存里的新吗"没有意义——网络请求本身已经保证了它更新。
 *
 * 会**覆盖掉手填的值**。这是故意的：用户手填是因为当时拉不到，
 * 拉得到之后就该回到真实汇率，否则那个临时值会一直骗到下一次有人想起来改它。
 */
export async function saveRates(rates: { code: string; perBase: number }[], source: RateSource): Promise<void> {
  if (rates.length === 0) return;
  const db = await getDb();
  const fetchedAt = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    for (const rate of rates) {
      await db.runAsync(
        'INSERT OR REPLACE INTO exchange_rates (code, perBase, fetchedAt, source) VALUES (?, ?, ?, ?)',
        [rate.code, rate.perBase, fetchedAt, source],
      );
    }
  });
}

/** 手填一个汇率。没网、没配 token、或者想照着 Wise App 上看到的数字抄一遍时走这条 */
export async function saveManualRate(code: string, perBase: number): Promise<void> {
  await saveRates([{ code, perBase }], 'manual');
}

/**
 * 「1 MYR = 38.53 日元」→「1 日元 = 0.02595 MYR」。
 *
 * 不在这里四舍五入：这个数是要乘上金额再存进库的中间量，先截精度等于把误差放大 38 倍。
 * 该定精度的地方是 convertToBase 的最后一步（钱只有两位小数）。
 */
export function toBaseRate(perBase: number): number {
  return 1 / perBase;
}

/**
 * 外币金额 → 本位币金额，四舍五入到分。
 *
 * 只取两位是因为它要存进 `transactions.amountInBase`，而那一列是全 App 所有统计、
 * 预算、日历小计的加数。留着第三位小数的话，一屏账单各自显示成两位、加起来却对不上——
 * 那种差几分的账最难查，因为每一行看上去都是对的。
 */
export function convertToBase(amount: number, baseRate: number): number {
  return Math.round(amount * baseRate * 100) / 100;
}
