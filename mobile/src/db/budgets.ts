import { getDb } from './client';

// 预算只有一种：一个月一个总数，用户在首页弹窗里直接填。
//
// 「已消费」= 本月全部支出，跳过 excludeFromStats 的交易（垫付的钱之后会回来，不该占用额度）。
// 超支判断仍然在本地算，不依赖服务器实时数据（CLAUDE.md 原则#4）——就算很久没同步，
// 手机上看到的预算提醒依然是准的。
//
// 早先做过"按分类设额度、总额靠加总"的版本，已经整个去掉（见 DECISIONS.md）。
// 本地 budgets 表保留着但不再读写，免得删表连带删掉用户已经填过的数据。

export type BudgetStatus = {
  /** 用户填的整体月度预算；没填过是 0 */
  budgetTotal: number;
  /** 本月全部支出（已跳过 excludeFromStats） */
  spent: number;
};

const OVERALL_BUDGET_KEY = 'overallMonthlyBudget';

// 预算存在本地 app_settings 里，不进服务器数据库：它是一个偏好值，不是账目数据。
// 这张表 v1 就建好了，是通用 key-value，值统一按字符串存。
export async function getOverallBudget(): Promise<number | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [
    OVERALL_BUDGET_KEY,
  ]);
  if (!row) return null;
  const amount = Number(row.value);
  // 存进去的是脏值时当作没设过，而不是让首页拿到 NaN 去算百分比
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

// 填 0 或负数等于取消预算，直接删行，不留一条 value = '0' 的噪音记录
export async function setOverallBudget(amount: number): Promise<void> {
  const db = await getDb();
  if (!Number.isFinite(amount) || amount <= 0) {
    await db.runAsync('DELETE FROM app_settings WHERE key = ?', [OVERALL_BUDGET_KEY]);
    return;
  }
  await db.runAsync(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [OVERALL_BUDGET_KEY, String(amount)],
  );
}

function monthRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return [start.toISOString(), end.toISOString()] as const;
}

export async function getBudgetStatus(date = new Date()): Promise<BudgetStatus> {
  const db = await getDb();
  const [start, end] = monthRange(date);

  const row = await db.getFirstAsync<{ total: number | null }>(
    `SELECT SUM(amountInBase) AS total
     FROM transactions
     WHERE type = 'EXPENSE' AND excludeFromStats = 0 AND date >= ? AND date < ?`,
    [start, end],
  );

  return {
    budgetTotal: (await getOverallBudget()) ?? 0,
    spent: row?.total ?? 0,
  };
}
