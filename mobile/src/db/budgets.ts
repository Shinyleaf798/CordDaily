import { getDb } from './client';

// 预算超支判断在本地算，不依赖服务器（CLAUDE.md 核心原则#4）：
// 就算很久没同步，手机上看到的预算提醒依然是准的。
// 算法跟后端 budget.service.js 保持一致——按分类对当月 EXPENSE 的 amountInBase 求和，
// 且同样跳过 excludeFromStats 的交易（垫付的钱不该算进预算消耗）。

export type Budget = {
  categoryId: string;
  amount: number;
  synced: number;
};

export type BudgetStatusItem = {
  categoryId: string;
  categoryName: string;
  categoryIcon: string | null;
  budget: number;
  spent: number;
  remaining: number;
  /** 已用百分比，预算为 0 时返回 0 而不是 Infinity */
  percentage: number;
  isOverspent: boolean;
};

export type BudgetStatus = {
  budgetTotal: number;
  spent: number;
  items: BudgetStatusItem[];
};

export async function listBudgets(): Promise<Budget[]> {
  const db = await getDb();
  return db.getAllAsync<Budget>('SELECT categoryId, amount, synced FROM budgets');
}

// categoryId 是主键，所以"给某个分类设预算"天然就是 upsert 语义，不需要额外的 id
// （跟后端 POST /budgets 的设计一致，见 DECISIONS.md 2026-09-09 那条）
export async function upsertBudget(categoryId: string, amount: number): Promise<void> {
  const db = await getDb();
  if (amount <= 0) {
    // 设成 0 等于取消这个分类的预算，直接删行，避免列表里留一堆 0 额度的噪音
    await db.runAsync('DELETE FROM budgets WHERE categoryId = ?', [categoryId]);
    return;
  }
  await db.runAsync(
    `INSERT INTO budgets (categoryId, amount, synced) VALUES (?, ?, 0)
     ON CONFLICT(categoryId) DO UPDATE SET amount = excluded.amount, synced = 0`,
    [categoryId, amount],
  );
}

function monthRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return [start.toISOString(), end.toISOString()] as const;
}

// 一次查询同时拿到"有预算的分类"和"当月已花"，LEFT JOIN 的方向是 budgets → transactions，
// 所以设了预算但这个月还没花钱的分类也会出现（spent = 0），不会从列表里消失
export async function getBudgetStatus(date = new Date()): Promise<BudgetStatus> {
  const db = await getDb();
  const [start, end] = monthRange(date);

  const rows = await db.getAllAsync<{
    categoryId: string;
    categoryName: string | null;
    categoryIcon: string | null;
    budget: number;
    spent: number | null;
  }>(
    `SELECT b.categoryId          AS categoryId,
            c.name                AS categoryName,
            c.icon                AS categoryIcon,
            b.amount              AS budget,
            SUM(t.amountInBase)   AS spent
     FROM budgets b
     LEFT JOIN categories c ON c.id = b.categoryId
     LEFT JOIN transactions t
            ON t.categoryId = b.categoryId
           AND t.type = 'EXPENSE'
           AND t.excludeFromStats = 0
           AND t.date >= ? AND t.date < ?
     GROUP BY b.categoryId
     ORDER BY b.amount DESC`,
    [start, end],
  );

  const items: BudgetStatusItem[] = rows.map((row) => {
    const spent = row.spent ?? 0;
    return {
      categoryId: row.categoryId,
      categoryName: row.categoryName ?? '未分类',
      categoryIcon: row.categoryIcon,
      budget: row.budget,
      spent,
      remaining: row.budget - spent,
      percentage: row.budget > 0 ? (spent / row.budget) * 100 : 0,
      isOverspent: spent > row.budget,
    };
  });

  return {
    // 总预算是各分类预算加总的衍生值，不单独存一个"总预算"字段——
    // 存了就会出现"总数跟分项对不上"的经典不一致问题
    budgetTotal: items.reduce((sum, item) => sum + item.budget, 0),
    spent: items.reduce((sum, item) => sum + item.spent, 0),
    items,
  };
}
