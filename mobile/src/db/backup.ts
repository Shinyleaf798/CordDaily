import { getDb } from './client';
import { getOverallBudget, setOverallBudget } from './budgets';

/**
 * 备份包的读写。三个函数一条链：`buildBackup` 打包 → `planImport` 干跑 → `applyImport` 落库。
 *
 * **一份格式，两个来源。** 导出成文件得到的 JSON，跟以后 `GET /sync/bundle` 从服务器拉回来的
 * 是同一个结构（CLAUDE.md 原则#3），所以恢复只有这一套代码，它不关心数据从哪来。
 *
 * **备份包必须自解释**：交易里出现的任何 id，同一份包里都要找得到它指的是什么。
 * 所以分类和账户是包的必需组成部分，不是一个可以不勾的选项——不勾的代价要几个月后
 * 恢复时才出现，那时文件已经没救了。
 *
 * **干跑和落库共用一份计划**：`planImport` 产出的 `ImportPlan` 既喂给预览页显示数字，
 * 也原样交给 `applyImport` 执行。分两套实现，预览上承诺的数字和实际写进去的迟早对不上。
 */

export const BACKUP_FORMAT = 'corddaily-backup' as const;
export const BACKUP_FORMAT_VERSION = 1;

type CategoryRow = {
  id: string;
  name: string;
  icon: string | null;
  type: 'INCOME' | 'EXPENSE';
  parentId: string | null;
  sortOrder: number;
  isActive: number;
};

type AccountRow = {
  id: string;
  name: string;
  type: string;
  currency: string;
  openingBalance: number;
  icon: string | null;
  createdAt: string;
};

type TransactionRow = Record<string, unknown> & { id: string; categoryId: string; accountId: string };

export type BackupBundle = {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  /** 导出那一刻本地库的 `user_version`。比当前库还新的包要拒绝导入——那些行里可能有本地还不认识的列 */
  schemaVersion: number;
  exportedAt: string;
  categories: CategoryRow[];
  accounts: AccountRow[];
  transactions: TransactionRow[];
  transactionImages: Record<string, unknown>[];
  transfers: Record<string, unknown>[];
  recurring: Record<string, unknown>[];
  /** 只存在本地、服务器没有的那些偏好。云端那条通道带不了它们，文件这条能 */
  settings: { overallMonthlyBudget: number | null };
};

// `synced` 是纯本地的一个标记（0 = 还没备份过），不该写进包里：
// 它描述的是"这台手机跟服务器的关系"，换一台手机之后这个关系要重新算（恢复完一律置 0）
const STRIP = 'synced';

function stripLocalFields<T extends Record<string, unknown>>(row: T): T {
  const { [STRIP]: _ignored, ...rest } = row;
  return rest as T;
}

async function getSchemaVersion(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

export type LocalStats = {
  transactions: number;
  /** 还没备份过的笔数（`synced = 0`）。没有自动同步兜底的时候，这个数是用户唯一的安全绳 */
  unsynced: number;
  /** 最早一笔账的日期，用来算「记账第 N 天」。一笔都没有时是 null，那一行就不显示 */
  firstTransactionDate: string | null;
};

export async function getLocalStats(): Promise<LocalStats> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ total: number; unsynced: number; firstDate: string | null }>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN synced = 0 THEN 1 ELSE 0 END) AS unsynced,
            MIN(date) AS firstDate
       FROM transactions`,
  );
  return {
    transactions: row?.total ?? 0,
    unsynced: row?.unsynced ?? 0,
    firstTransactionDate: row?.firstDate ?? null,
  };
}

export type BackupRange = { from?: string; to?: string };

/**
 * 打包。分类和账户永远是**全量**，只有账单吃 range——
 * 导"本月"时如果分类也跟着筛，导出来的包就不自解释了。
 */
export async function buildBackup(range: BackupRange = {}): Promise<BackupBundle> {
  const db = await getDb();

  const where: string[] = [];
  const params: string[] = [];
  if (range.from) {
    where.push('date >= ?');
    params.push(range.from);
  }
  if (range.to) {
    where.push('date < ?');
    params.push(range.to);
  }
  const filter = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const transactions = await db.getAllAsync<TransactionRow>(`SELECT * FROM transactions ${filter}`, params);
  const ids = transactions.map((transaction) => transaction.id);

  // 图片按这批账单过滤。一次性拼 IN 列表在几千条时也还好，真到那个量级之前不值得分批
  const placeholders = ids.map(() => '?').join(',');
  const images = ids.length
    ? await db.getAllAsync<Record<string, unknown>>(
        `SELECT * FROM transaction_images WHERE transactionId IN (${placeholders})`,
        ids,
      )
    : [];

  const [categories, accounts, transfers, recurring, budget] = await Promise.all([
    db.getAllAsync<CategoryRow>('SELECT * FROM categories ORDER BY parentId IS NOT NULL, sortOrder, rowid'),
    db.getAllAsync<AccountRow>('SELECT * FROM accounts ORDER BY createdAt, id'),
    db.getAllAsync<Record<string, unknown>>('SELECT * FROM transfers'),
    db.getAllAsync<Record<string, unknown>>('SELECT * FROM recurring_transactions'),
    getOverallBudget(),
  ]);

  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: await getSchemaVersion(),
    exportedAt: new Date().toISOString(),
    categories: categories.map(stripLocalFields),
    accounts: accounts.map(stripLocalFields),
    transactions: transactions.map(stripLocalFields),
    transactionImages: images,
    transfers: transfers.map(stripLocalFields),
    recurring: recurring.map(stripLocalFields),
    settings: { overallMonthlyBudget: budget },
  };
}

/**
 * 导出成给人看的表格。跟 bundle 是两件事，别混：
 * 这里写的是**名字**（`餐饮 / 晚餐`）不是 id，所以它能在 Excel 里读懂，
 * 但导回来时只能按名字猜分类——那条路要过一道「分类对照」。
 *
 * 用 `\r\n` 和 BOM：Excel 在简体中文 Windows 上默认按 GBK 解 CSV，没有 BOM 的 UTF-8
 * 打开就是乱码，而这个文件存在的唯一意义就是能被 Excel 打开。
 */
export async function buildCsv(range: BackupRange = {}): Promise<string> {
  const db = await getDb();

  const where: string[] = [];
  const params: string[] = [];
  if (range.from) {
    where.push('t.date >= ?');
    params.push(range.from);
  }
  if (range.to) {
    where.push('t.date < ?');
    params.push(range.to);
  }
  const filter = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = await db.getAllAsync<Record<string, string | number | null>>(
    `SELECT t.date, t.type, t.amount, t.currency, t.amountInBase,
            parent.name AS parentName, c.name AS categoryName, a.name AS accountName,
            t.title, t.merchant, t.location, t.remarks, t.tags,
            t.isReimbursable, t.reimbursedAt, t.excludeFromStats
       FROM transactions t
       JOIN categories c ON c.id = t.categoryId
       LEFT JOIN categories parent ON parent.id = c.parentId
       JOIN accounts a ON a.id = t.accountId
       ${filter}
       ORDER BY t.date DESC`,
    params,
  );

  const header = [
    '日期', '收支', '金额', '币种', '折算后', '分类', '子分类', '账户',
    '主题', '店名', '地点', '备注', '标签', '可报销', '已收回', '不计入统计',
  ];

  const escape = (value: unknown) => {
    const text = value === null || value === undefined ? '' : String(value);
    // 逗号、引号、换行三种字符必须整段加引号，引号本身再翻倍——RFC 4180 的最小实现
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const lines = [header.join(',')];
  for (const row of rows) {
    // 有父分类时，c.name 是子分类；没有父时 c.name 就是一级分类，子分类列留空
    const isChild = !!row.parentName;
    let tags = '';
    try {
      tags = (JSON.parse(String(row.tags ?? '[]')) as string[]).join(' ');
    } catch {
      tags = '';
    }

    lines.push(
      [
        String(row.date ?? '').slice(0, 10),
        row.type === 'INCOME' ? '收入' : '支出',
        row.amount,
        row.currency,
        row.amountInBase,
        isChild ? row.parentName : row.categoryName,
        isChild ? row.categoryName : '',
        row.accountName,
        row.title,
        row.merchant,
        row.location,
        row.remarks,
        tags,
        row.isReimbursable ? '是' : '',
        row.reimbursedAt ? String(row.reimbursedAt).slice(0, 10) : '',
        row.excludeFromStats ? '是' : '',
      ]
        .map(escape)
        .join(','),
    );
  }

  return `﻿${lines.join('\r\n')}\r\n`;
}

/** 解析并校验一个文件的内容。**不抛裸错误**——每一条都要能直接显示给用户 */
export async function parseBundle(text: string): Promise<BackupBundle> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('这个文件不是备份文件（读不出 JSON）');
  }

  const bundle = parsed as Partial<BackupBundle>;
  if (bundle?.format !== BACKUP_FORMAT) {
    throw new Error('这个文件不是 CordDaily 的备份');
  }
  if (!Array.isArray(bundle.transactions) || !Array.isArray(bundle.categories)) {
    throw new Error('备份文件缺了账单或分类，没法恢复');
  }

  // 比本地还新的包直接挡住：里面的行可能带着本地这版还不认识的列，
  // 硬插进去要么报错、要么悄悄丢字段，后者更糟
  const local = await getSchemaVersion();
  if ((bundle.schemaVersion ?? 0) > local) {
    throw new Error('这份备份来自更新版本的 App，请先升级再恢复');
  }

  return {
    ...(bundle as BackupBundle),
    accounts: bundle.accounts ?? [],
    transactionImages: bundle.transactionImages ?? [],
    transfers: bundle.transfers ?? [],
    recurring: bundle.recurring ?? [],
    settings: bundle.settings ?? { overallMonthlyBudget: null },
  };
}

/** 同一层里认"同一个分类"的口径：收支类型 + 父的名字 + 自己的名字。
 *  光比名字不行——「其他」在收入和支出下面各有一个，「饮料」可能同时挂在餐饮和购物下 */
function pathKey(type: string, parentName: string | null, name: string): string {
  return `${type}|${parentName ?? ''}|${name}`;
}

export type CategoryResolution = {
  source: CategoryRow;
  /** 来源里这个分类底下有多少笔账（给对照页显示"这条选错会影响多少账"） */
  transactionCount: number;
  /** exists = 本地已有同一个 id；matched = 按名字对上了本地另一个 id；create = 本地没有，照建 */
  action: 'exists' | 'matched' | 'create';
  targetId: string;
  /** 只有"按名字猜"出来的才需要用户确认（CSV、两台手机合并）。JSON 包里 id 是权威的，不用问 */
  needsChoice: boolean;
};

export type ImportPlan = {
  bundle: BackupBundle;
  /**
   * 空库快路径：本地一笔账都没有，那几个默认分类没人引用，
   * 于是整张字典可以**原样采用**来源里的版本（连改过的名字、停用状态一起回来），
   * 一个 id 都不用改写。重装后恢复走的就是这条。
   */
  adoptWholesale: boolean;
  categories: CategoryResolution[];
  newAccounts: number;
  newTransactions: number;
  duplicateTransactions: number;
  /** 本地还没设过预算时才会带上它，不覆盖用户当前填的数 */
  budgetToRestore: number | null;
};

export async function planImport(bundle: BackupBundle): Promise<ImportPlan> {
  const db = await getDb();

  const localCategories = await db.getAllAsync<CategoryRow>('SELECT * FROM categories');
  const localAccounts = await db.getAllAsync<{ id: string; name: string }>('SELECT id, name FROM accounts');
  const localTransactionIds = new Set(
    (await db.getAllAsync<{ id: string }>('SELECT id FROM transactions')).map((row) => row.id),
  );
  const localCount = localTransactionIds.size;

  const localById = new Map(localCategories.map((category) => [category.id, category]));
  const localNameById = new Map(localCategories.map((category) => [category.id, category.name]));
  const localByPath = new Map(
    localCategories.map((category) => [
      pathKey(category.type, category.parentId ? (localNameById.get(category.parentId) ?? null) : null, category.name),
      category,
    ]),
  );

  const sourceNameById = new Map(bundle.categories.map((category) => [category.id, category.name]));
  const countByCategory = new Map<string, number>();
  for (const transaction of bundle.transactions) {
    countByCategory.set(transaction.categoryId, (countByCategory.get(transaction.categoryId) ?? 0) + 1);
  }

  const adoptWholesale = localCount === 0;

  const categories: CategoryResolution[] = bundle.categories.map((source) => {
    const transactionCount = countByCategory.get(source.id) ?? 0;

    if (localById.has(source.id)) {
      return { source, transactionCount, action: 'exists', targetId: source.id, needsChoice: false };
    }

    // 没有 id 能对上时才退到按名字猜。CSV 那条路上每一行都会走到这里
    const matched = localByPath.get(
      pathKey(source.type, source.parentId ? (sourceNameById.get(source.parentId) ?? null) : null, source.name),
    );
    if (matched) {
      return { source, transactionCount, action: 'matched', targetId: matched.id, needsChoice: false };
    }

    return { source, transactionCount, action: 'create', targetId: source.id, needsChoice: false };
  });

  const localAccountIds = new Set(localAccounts.map((account) => account.id));
  const localAccountByName = new Map(localAccounts.map((account) => [account.name, account.id]));
  const newAccounts = bundle.accounts.filter(
    (account) => !localAccountIds.has(account.id) && !localAccountByName.has(account.name),
  ).length;

  const newTransactions = bundle.transactions.filter((transaction) => !localTransactionIds.has(transaction.id)).length;

  return {
    bundle,
    adoptWholesale,
    categories,
    newAccounts,
    newTransactions,
    duplicateTransactions: bundle.transactions.length - newTransactions,
    budgetToRestore: (await getOverallBudget()) === null ? bundle.settings.overallMonthlyBudget : null,
  };
}

export type ImportResult = {
  transactions: number;
  skipped: number;
  categories: number;
  accounts: number;
  transfers: number;
  recurring: number;
  budgetRestored: number | null;
};

/**
 * 落库。**整段一个事务**：中途失败必须整体回滚——半截恢复的库比没恢复更难收拾
 * （用户看到账单来了一半，没法判断该不该再导一次）。
 *
 * `choices` 是对照页的结果：来源分类 id → 本地分类 id。没给的按 plan 里算好的走。
 */
export async function applyImport(plan: ImportPlan, choices: Record<string, string> = {}): Promise<ImportResult> {
  const db = await getDb();
  const { bundle } = plan;

  const idMap = new Map<string, string>();
  for (const resolution of plan.categories) {
    idMap.set(resolution.source.id, choices[resolution.source.id] ?? resolution.targetId);
  }

  const accountMap = new Map<string, string>();
  const localAccounts = await db.getAllAsync<{ id: string; name: string }>('SELECT id, name FROM accounts');
  const localAccountIds = new Set(localAccounts.map((account) => account.id));
  const localAccountByName = new Map(localAccounts.map((account) => [account.name, account.id]));
  for (const account of bundle.accounts) {
    accountMap.set(
      account.id,
      localAccountIds.has(account.id) ? account.id : (localAccountByName.get(account.name) ?? account.id),
    );
  }

  const localTransactionIds = new Set(
    (await db.getAllAsync<{ id: string }>('SELECT id FROM transactions')).map((row) => row.id),
  );

  const result: ImportResult = {
    transactions: 0,
    skipped: 0,
    categories: 0,
    accounts: 0,
    transfers: 0,
    recurring: 0,
    budgetRestored: null,
  };

  await db.withTransactionAsync(async () => {
    // 分类：父必须先落地，子的 parentId 才有指向。bundle 里已经是父在前，
    // 这里再排一次是为了不依赖来源的顺序（手改过的文件、以后换个服务器实现都可能乱序）
    const ordered = [...bundle.categories].sort((a, b) => Number(!!a.parentId) - Number(!!b.parentId));
    for (const source of ordered) {
      const resolution = plan.categories.find((item) => item.source.id === source.id);
      if (!resolution) continue;

      const targetId = idMap.get(source.id) ?? source.id;
      const parentId = source.parentId ? (idMap.get(source.parentId) ?? source.parentId) : null;

      if (resolution.action === 'create' && !choices[source.id]) {
        await db.runAsync(
          `INSERT OR IGNORE INTO categories (id, name, icon, type, parentId, sortOrder, isActive, synced)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
          [targetId, source.name, source.icon, source.type, parentId, source.sortOrder ?? 0, source.isActive ?? 1],
        );
        result.categories += 1;
        continue;
      }

      // 空库时本地那份是刚 seed 出来的原始默认分类，来源里那份才是用户整理过的：
      // 改过的名字、换过的图标、停用状态、拖出来的顺序，全部覆盖回来。
      // 库里已经有账的时候反过来——本地是用户当下在用的，不能被一份旧备份改写
      if (resolution.action === 'exists' && plan.adoptWholesale) {
        await db.runAsync(
          `UPDATE categories SET name = ?, icon = ?, parentId = ?, sortOrder = ?, isActive = ?, synced = 0 WHERE id = ?`,
          [source.name, source.icon, parentId, source.sortOrder ?? 0, source.isActive ?? 1, targetId],
        );
      }
    }

    for (const account of bundle.accounts) {
      const targetId = accountMap.get(account.id) ?? account.id;
      if (localAccountIds.has(targetId) || localAccountByName.has(account.name)) continue;
      await db.runAsync(
        `INSERT OR IGNORE INTO accounts (id, name, type, currency, openingBalance, icon, createdAt, synced)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          targetId,
          account.name,
          account.type ?? 'OTHER',
          account.currency ?? 'MYR',
          account.openingBalance ?? 0,
          account.icon ?? null,
          account.createdAt ?? new Date().toISOString(),
        ],
      );
      result.accounts += 1;
    }

    for (const transaction of bundle.transactions) {
      if (localTransactionIds.has(transaction.id)) {
        result.skipped += 1;
        continue;
      }
      const categoryId = idMap.get(transaction.categoryId) ?? transaction.categoryId;
      const accountId = accountMap.get(transaction.accountId) ?? transaction.accountId;

      // synced 一律 0：这些记录对这台手机来说都"还没备份过"。就算它们在旧手机上推过，
      // 再推一次也不会变两份——服务器按 id 幂等去重（CLAUDE.md 原则#2）
      await db.runAsync(
        `INSERT OR IGNORE INTO transactions
           (id, title, remarks, amount, currency, exchangeRate, amountInBase, type, date, tags,
            isReimbursable, excludeFromStats, categoryId, accountId, recurringId, createdAt, updatedAt,
            merchant, location, reimbursedAt, synced)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          transaction.id,
          transaction.title as string,
          (transaction.remarks as string) ?? null,
          transaction.amount as number,
          (transaction.currency as string) ?? 'MYR',
          (transaction.exchangeRate as number) ?? 1,
          transaction.amountInBase as number,
          transaction.type as string,
          transaction.date as string,
          (transaction.tags as string) ?? '[]',
          (transaction.isReimbursable as number) ?? 0,
          (transaction.excludeFromStats as number) ?? 0,
          categoryId,
          accountId,
          (transaction.recurringId as string) ?? null,
          (transaction.createdAt as string) ?? new Date().toISOString(),
          (transaction.updatedAt as string) ?? new Date().toISOString(),
          (transaction.merchant as string) ?? null,
          (transaction.location as string) ?? null,
          (transaction.reimbursedAt as string) ?? null,
        ],
      );
      result.transactions += 1;
    }

    for (const image of bundle.transactionImages) {
      await db.runAsync(
        `INSERT OR IGNORE INTO transaction_images (id, transactionId, url, createdAt) VALUES (?, ?, ?, ?)`,
        [image.id as string, image.transactionId as string, image.url as string, image.createdAt as string],
      );
    }

    for (const transfer of bundle.transfers) {
      await db.runAsync(
        `INSERT OR IGNORE INTO transfers (id, amount, date, note, fromAccountId, toAccountId, createdAt, synced)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          transfer.id as string,
          transfer.amount as number,
          transfer.date as string,
          (transfer.note as string) ?? null,
          accountMap.get(transfer.fromAccountId as string) ?? (transfer.fromAccountId as string),
          accountMap.get(transfer.toAccountId as string) ?? (transfer.toAccountId as string),
          (transfer.createdAt as string) ?? new Date().toISOString(),
        ],
      );
      result.transfers += 1;
    }

    for (const rule of bundle.recurring) {
      await db.runAsync(
        `INSERT OR IGNORE INTO recurring_transactions
           (id, title, remarks, amount, currency, exchangeRate, type, frequency, startDate, nextRunDate,
            endDate, isActive, categoryId, accountId, createdAt, synced)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          rule.id as string,
          rule.title as string,
          (rule.remarks as string) ?? null,
          rule.amount as number,
          (rule.currency as string) ?? 'MYR',
          (rule.exchangeRate as number) ?? 1,
          rule.type as string,
          rule.frequency as string,
          rule.startDate as string,
          rule.nextRunDate as string,
          (rule.endDate as string) ?? null,
          (rule.isActive as number) ?? 1,
          idMap.get(rule.categoryId as string) ?? (rule.categoryId as string),
          accountMap.get(rule.accountId as string) ?? (rule.accountId as string),
          (rule.createdAt as string) ?? new Date().toISOString(),
        ],
      );
      result.recurring += 1;
    }
  });

  // 预算在事务外面写：它走的是 app_settings 的自己那套读写，而且写不写都不影响账目的完整性
  if (plan.budgetToRestore && plan.budgetToRestore > 0) {
    await setOverallBudget(plan.budgetToRestore);
    result.budgetRestored = plan.budgetToRestore;
  }

  return result;
}
