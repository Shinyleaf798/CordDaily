import * as Crypto from 'expo-crypto';

import { getDb } from './client';

export type TransactionType = 'INCOME' | 'EXPENSE';

// SQLite 没有布尔和数组类型：isReimbursable/excludeFromStats 存 0/1，tags 存 JSON 字符串。
// Row 是库里的原始形状，Transaction 是解出来给 UI 用的形状，两者靠 mapRow 转换。
type TransactionRow = {
  id: string;
  title: string;
  merchant: string | null;
  location: string | null;
  remarks: string | null;
  amount: number;
  currency: string;
  exchangeRate: number;
  amountInBase: number;
  type: TransactionType;
  date: string;
  tags: string;
  isReimbursable: number;
  reimbursedAt: string | null;
  excludeFromStats: number;
  categoryId: string;
  accountId: string;
  recurringId: string | null;
  createdAt: string;
  updatedAt: string;
  synced: number;
};

export type Transaction = Omit<TransactionRow, 'tags' | 'isReimbursable' | 'excludeFromStats'> & {
  tags: string[];
  isReimbursable: boolean;
  excludeFromStats: boolean;
};

export type TransactionWithCategory = Transaction & {
  categoryName: string | null;
  categoryIcon: string | null;
};

// 详情弹层要连账户名一起显示，比 TransactionWithCategory 多一个 JOIN
export type TransactionDetail = TransactionWithCategory & {
  accountName: string | null;
};

function mapRow<T extends TransactionRow>(row: T) {
  return {
    ...row,
    tags: safeParseTags(row.tags),
    isReimbursable: row.isReimbursable === 1,
    excludeFromStats: row.excludeFromStats === 1,
  };
}

// 标签存的是 JSON，解析失败时退回空数组而不是让整个列表崩掉
function safeParseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

export type CreateTransactionInput = {
  title: string;
  merchant?: string | null;
  location?: string | null;
  remarks?: string | null;
  amount: number;
  type: TransactionType;
  categoryId: string;
  accountId: string;
  date?: string;
  tags?: string[];
  isReimbursable?: boolean;
  excludeFromStats?: boolean;
};

// id 在本地创建的这一刻就生成好（CLAUDE.md 核心原则#2），同步时后端用它做幂等去重。
// 注意这里如实存 excludeFromStats，不因为 isReimbursable 就强制改写：
// 「报销默认不计入统计」这条联动放在录入界面做，用户看得见也能取消——
// 在这一层偷偷改写会导致界面显示"不计入统计=关"但库里存的是开。
export async function createTransaction(input: CreateTransactionInput): Promise<Transaction> {
  const db = await getDb();
  const now = new Date().toISOString();
  const isReimbursable = input.isReimbursable ?? false;

  const row: TransactionRow = {
    id: Crypto.randomUUID(),
    title: input.title,
    merchant: input.merchant?.trim() || null,
    location: input.location?.trim() || null,
    remarks: input.remarks?.trim() || null,
    amount: input.amount,
    currency: 'MYR',
    exchangeRate: 1,
    // 单币种阶段 amountInBase 跟 amount 相同，等做多币种时改成 amount * exchangeRate
    amountInBase: input.amount,
    type: input.type,
    date: input.date ?? now,
    tags: JSON.stringify(input.tags ?? []),
    isReimbursable: isReimbursable ? 1 : 0,
    reimbursedAt: null,
    excludeFromStats: input.excludeFromStats ? 1 : 0,
    categoryId: input.categoryId,
    accountId: input.accountId,
    recurringId: null,
    createdAt: now,
    updatedAt: now,
    synced: 0,
  };

  await db.runAsync(
    `INSERT INTO transactions
       (id, title, merchant, location, remarks, amount, currency, exchangeRate, amountInBase, type, date,
        tags, isReimbursable, reimbursedAt, excludeFromStats, categoryId, accountId, recurringId, createdAt, updatedAt, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id, row.title, row.merchant, row.location, row.remarks, row.amount, row.currency, row.exchangeRate,
      row.amountInBase, row.type, row.date, row.tags, row.isReimbursable, row.reimbursedAt, row.excludeFromStats,
      row.categoryId, row.accountId, row.recurringId, row.createdAt, row.updatedAt, row.synced,
    ],
  );

  return mapRow(row);
}

/** 单笔详情。带上分类名/图标和账户名，详情弹层一次查询就够，不用再各查一次 */
export async function getTransaction(id: string): Promise<TransactionDetail | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<
    TransactionRow & { categoryName: string | null; categoryIcon: string | null; accountName: string | null }
  >(
    `SELECT t.*, c.name AS categoryName, c.icon AS categoryIcon, a.name AS accountName
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.categoryId
     LEFT JOIN accounts a ON a.id = t.accountId
     WHERE t.id = ?`,
    [id],
  );

  return row ? mapRow(row) : null;
}

export type UpdateTransactionInput = CreateTransactionInput & { id: string };

/**
 * 改一笔已有的交易。
 *
 * 不动的三个字段：`id`（客户端生成，是同步幂等的依据，改了就变成另一笔）、
 * `createdAt`（录入时刻，跟交易发生时刻 date 是两件事）、`reimbursedAt`（报销收回状态有自己的入口）。
 * `synced` 一律置 0：这条记录跟服务器上那份已经不一样了，下次同步要重新推。
 */
export async function updateTransaction(input: UpdateTransactionInput): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();

  await db.runAsync(
    `UPDATE transactions SET
       title = ?, merchant = ?, location = ?, remarks = ?, amount = ?, amountInBase = ?, type = ?, date = ?,
       tags = ?, isReimbursable = ?, excludeFromStats = ?, categoryId = ?, accountId = ?, updatedAt = ?, synced = 0
     WHERE id = ?`,
    [
      input.title,
      input.merchant?.trim() || null,
      input.location?.trim() || null,
      input.remarks?.trim() || null,
      input.amount,
      input.amount,
      input.type,
      input.date ?? now,
      JSON.stringify(input.tags ?? []),
      input.isReimbursable ? 1 : 0,
      input.excludeFromStats ? 1 : 0,
      input.categoryId,
      input.accountId,
      now,
      input.id,
    ],
  );
}

/**
 * 复制一笔，日期落在**此刻**而不是原来那天。
 *
 * 复制的用途是"今天又买了一样的东西"——每天同一杯咖啡、每周同一趟车费。
 * 原样照搬旧日期的话，复制出来的那笔会直接落进历史里：首页只看近7天，
 * 复制一笔三周前的账，界面上什么都不会发生，用户只会以为按钮坏了。
 *
 * `reimbursedAt` 也不抄：那是旧的那笔钱已经收回来了，新的这笔还没有。
 */
export async function duplicateTransaction(id: string): Promise<Transaction> {
  const db = await getDb();
  const source = await db.getFirstAsync<TransactionRow>('SELECT * FROM transactions WHERE id = ?', [id]);
  if (!source) throw new Error('这笔交易已经不在了');

  const now = new Date().toISOString();
  const copy: TransactionRow = {
    ...source,
    id: Crypto.randomUUID(),
    date: now,
    reimbursedAt: null,
    createdAt: now,
    updatedAt: now,
    synced: 0,
  };

  await db.runAsync(
    `INSERT INTO transactions
       (id, title, merchant, location, remarks, amount, currency, exchangeRate, amountInBase, type, date,
        tags, isReimbursable, reimbursedAt, excludeFromStats, categoryId, accountId, recurringId, createdAt, updatedAt, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      copy.id, copy.title, copy.merchant, copy.location, copy.remarks, copy.amount, copy.currency, copy.exchangeRate,
      copy.amountInBase, copy.type, copy.date, copy.tags, copy.isReimbursable, copy.reimbursedAt, copy.excludeFromStats,
      copy.categoryId, copy.accountId, copy.recurringId, copy.createdAt, copy.updatedAt, copy.synced,
    ],
  );

  return mapRow(copy);
}

/**
 * 真删行，不是软删除。
 *
 * 已知代价：这笔要是已经同步到服务器了，本地删掉服务器上那份还在——单向同步没有"删除"这个动作。
 * 等做同步时要补一张墓碑表（记下被删的 id 推给服务器），现在服务器上一条数据都还没有，
 * 为一个还不存在的问题先建表不划算。这条记在 DECISIONS.md 里，别忘了。
 */
export async function deleteTransaction(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM transactions WHERE id = ?', [id]);
}

// 首页的近期账单。不过滤 excludeFromStats——账单列表要显示全部交易，
// "不计入统计"影响的是汇总数字，不是这条记录存不存在
export async function listRecentTransactions(days = 7): Promise<TransactionWithCategory[]> {
  const db = await getDb();
  const since = new Date();
  since.setDate(since.getDate() - days);

  const rows = await db.getAllAsync<TransactionRow & { categoryName: string | null; categoryIcon: string | null }>(
    `SELECT t.*, c.name AS categoryName, c.icon AS categoryIcon
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.categoryId
     WHERE t.date >= ?
     ORDER BY t.date DESC`,
    [since.toISOString()],
  );

  return rows.map(mapRow);
}

// ---- 统计：这几个查询都带 excludeFromStats = 0，这才是"不计入统计"真正生效的地方 ----

function monthRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return [start.toISOString(), end.toISOString()] as const;
}

export type MonthSummary = { month: string; income: number; expense: number; balance: number };

export async function getMonthSummary(date = new Date()): Promise<MonthSummary> {
  const db = await getDb();
  const [start, end] = monthRange(date);

  const row = await db.getFirstAsync<{ income: number | null; expense: number | null }>(
    `SELECT
       SUM(CASE WHEN type = 'INCOME'  THEN amountInBase ELSE 0 END) AS income,
       SUM(CASE WHEN type = 'EXPENSE' THEN amountInBase ELSE 0 END) AS expense
     FROM transactions
     WHERE excludeFromStats = 0 AND date >= ? AND date < ?`,
    [start, end],
  );

  const income = row?.income ?? 0;
  const expense = row?.expense ?? 0;
  return { month: `${date.getMonth() + 1}月`, income, expense, balance: income - expense };
}

// ---- 标签：跟分类正交的第二个汇总维度 ----

export type TagSummary = { tag: string; total: number; count: number };

// tags 存成 JSON 字符串，SQLite 没法直接 GROUP BY 数组元素，所以取出来在 JS 里摊平。
// 交易量大了之后再考虑建 transaction_tags 关联表；现在本地数据量级完全够用，
// 先不为了一个汇总页引入一张要额外同步的表。
export async function listTagSummaries(): Promise<TagSummary[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ tags: string; amountInBase: number }>(
    `SELECT tags, amountInBase FROM transactions WHERE type = 'EXPENSE' AND tags != '[]'`,
  );

  const totals = new Map<string, TagSummary>();
  for (const row of rows) {
    for (const tag of safeParseTags(row.tags)) {
      const entry = totals.get(tag) ?? { tag, total: 0, count: 0 };
      entry.total += row.amountInBase;
      entry.count += 1;
      totals.set(tag, entry);
    }
  }

  return [...totals.values()].sort((a, b) => b.total - a.total);
}

export type TagCategoryBreakdown = { categoryId: string; categoryName: string; categoryIcon: string | null; total: number };

// 一个标签内部按分类拆开——这才是标签的价值所在：
// "日本旅行"横跨机票(交通)+拉面(餐饮)+药妆(购物)，用分类维度永远算不出这趟一共花了多少
export async function getTagBreakdown(tag: string): Promise<TagCategoryBreakdown[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<TransactionRow & { categoryName: string | null; categoryIcon: string | null }>(
    `SELECT t.*, c.name AS categoryName, c.icon AS categoryIcon
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.categoryId
     WHERE t.type = 'EXPENSE' AND t.tags != '[]'`,
  );

  const totals = new Map<string, TagCategoryBreakdown>();
  for (const row of rows) {
    if (!safeParseTags(row.tags).includes(tag)) continue;
    const entry = totals.get(row.categoryId) ?? {
      categoryId: row.categoryId,
      categoryName: row.categoryName ?? '未分类',
      categoryIcon: row.categoryIcon,
      total: 0,
    };
    entry.total += row.amountInBase;
    totals.set(row.categoryId, entry);
  }

  return [...totals.values()].sort((a, b) => b.total - a.total);
}

// ---- 报销：reimbursedAt 为 null 才是"待收回" ----

export async function listReimbursements(settled: boolean): Promise<TransactionWithCategory[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<TransactionRow & { categoryName: string | null; categoryIcon: string | null }>(
    `SELECT t.*, c.name AS categoryName, c.icon AS categoryIcon
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.categoryId
     WHERE t.isReimbursable = 1 AND t.reimbursedAt IS ${settled ? 'NOT NULL' : 'NULL'}
     ORDER BY t.date DESC`,
  );

  return rows.map(mapRow);
}

// "我现在垫了多少钱还没收回来"——报销功能存在的意义就是这个数字
export async function getPendingReimbursementTotal(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ total: number | null }>(
    `SELECT SUM(amountInBase) AS total FROM transactions WHERE isReimbursable = 1 AND reimbursedAt IS NULL`,
  );
  return row?.total ?? 0;
}

export async function setReimbursed(id: string, reimbursed: boolean): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(`UPDATE transactions SET reimbursedAt = ?, updatedAt = ?, synced = 0 WHERE id = ?`, [
    reimbursed ? now : null,
    now,
    id,
  ]);
}

// ---- 店名/地点的历史补全 ----

// 店名和地点故意反规范化存在 transactions 表上，没有独立的 merchants 表：
// 建表会多出一个同步端点和"商家必须先于交易插入"的顺序依赖，而复用价值（输入补全 + 按商家统计）
// 靠这里的 GROUP BY 查询就能拿到。等到商家自己需要属性（默认分类、logo）再考虑拆表。
export type SuggestionField = 'merchant' | 'location';

// 按历史出现次数排序给补全建议：你常去的那几家会排在最前面。
// 字段名不能用 ? 绑定，所以用联合类型在类型层面锁死只能传这两个值，不接受外部拼进来的字符串。
export async function suggestFieldValues(field: SuggestionField, keyword: string, limit = 5): Promise<string[]> {
  const db = await getDb();
  const trimmed = keyword.trim();

  const rows = await db.getAllAsync<{ value: string }>(
    `SELECT ${field} AS value, COUNT(*) AS uses
     FROM transactions
     WHERE ${field} IS NOT NULL AND ${field} != ''
       AND (? = '' OR ${field} LIKE ? ESCAPE '\\')
     GROUP BY value COLLATE NOCASE
     ORDER BY uses DESC, MAX(date) DESC
     LIMIT ?`,
    [trimmed, `%${escapeLike(trimmed)}%`, limit],
  );

  return rows.map((row) => row.value);
}

// 记住"上次在这家店选的是哪个分类"，下次输入同样的店名就能自动选中分类。
// 这是把店名做成独立字段（而不是塞进备注自由文本）最主要的实际回报。
export async function getLastCategoryForMerchant(merchant: string): Promise<string | null> {
  const trimmed = merchant.trim();
  if (!trimmed) return null;

  const db = await getDb();
  const row = await db.getFirstAsync<{ categoryId: string }>(
    `SELECT categoryId FROM transactions WHERE merchant = ? COLLATE NOCASE ORDER BY date DESC LIMIT 1`,
    [trimmed],
  );

  return row?.categoryId ?? null;
}

// LIKE 里 % 和 _ 是通配符，用户真输入这两个字符时要转义，否则搜"100%"会匹配到所有记录
function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
