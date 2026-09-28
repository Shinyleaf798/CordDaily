import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES_FLAT } from '@/constants/default-categories';

import {
  collectCategoryIconBlobs,
  restoreCategoryIconBlobs,
  type CategoryIconBlob,
} from './category-icon-files';
import { getDb } from './client';
import { getOverallBudget, setOverallBudget } from './budgets';
import {
  accountFingerprint,
  categoryFingerprint,
  isUntouchedSinceSync,
  type AccountFingerprintRow,
  type CategoryFingerprintRow,
} from './sync-fingerprint';

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

/**
 * 这份包从哪来。影响的只有一件事：写进本地库的行算不算"已经备份过"
 * （见 applyImport）。除此之外恢复的每一步都跟来源无关——一份格式，两个来源。
 */
export type ImportSource = 'cloud' | 'file';

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
  /**
   * 分类里用到的自定义图标，文件名 + base64。
   *
   * 图片跟着包走，而不是只存一个 `custom:xxx.jpg` 的引用：**包要自解释**（CLAUDE.md 原则#3）。
   * 只存引用的话，重装恢复后每个自己传过图的分类都变成一个 📦，而那张图已经没了。
   * 单张十几 KB、数量是"用户手动传过几次"这个量级，塞进 JSON 的代价可以忽略。
   *
   * 老版本导出的包没有这个字段，parseBundle 补成空数组——少几张图标不影响任何一笔账。
   */
  categoryIcons: CategoryIconBlob[];
  accounts: AccountRow[];
  transactions: TransactionRow[];
  transactionImages: Record<string, unknown>[];
  transfers: Record<string, unknown>[];
  recurring: Record<string, unknown>[];
  /** 只存在本地、服务器没有的那些偏好。云端那条通道带不了它们，文件这条能 */
  settings: { overallMonthlyBudget: number | null };
};

// `synced` 和 `syncedFingerprint` 都是纯本地的记账（这行备份过没有、上次推上去时长什么样），
// 不该写进包里：它们描述的是"**这台**手机跟服务器的关系"，换一台手机之后这个关系要重新算
// （恢复时按包的来源重新定，见 applyImport 的 source 参数和那个 fingerprintFor）。
//
// 漏掉指纹的后果比漏掉 synced 更难看出来：包里会多带一列看着很像数据的字符串，
// 而它在另一台设备上的含义是错的——那台机器从没推过这一行
const STRIP = ['synced', 'syncedFingerprint'] as const;

function stripLocalFields<T extends Record<string, unknown>>(row: T): T {
  const rest = { ...row };
  for (const field of STRIP) delete rest[field];
  return rest;
}

async function getSchemaVersion(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

/**
 * 待推送的记录，按种类分开。
 *
 * **原封不动的内置分类和账户不算在里面。** 13 个一级 + 15 个子分类 + 2 个账户，
 * 每台设备装完就有、id 还是写死的同一批（constants/default-categories.ts）。
 * 把它们计进去的后果，是一个字都没记过的新用户打开备份层看到「要上传的记录 30 条」——
 * 数字没错，但它回答的不是用户问的那个问题（"我有多少东西还没上去"）。
 *
 * 它们照样会被推上去（服务器那边得先有这一行，账单的外键才落得下），
 * 只是作为**骨架**跟着账单一起走，不占用户的计数。见 db/sync.ts 里推分类那一段。
 *
 * **但"改过的内置分类"要算。** 把「餐饮」改名成「吃饭」、把「社交」停用，这就是用户自己的数据了，
 * 只是恰好住在一个内置 id 上。按 id 一刀切排除的话，只做过这一件事的用户会看到
 * 「云端已经是最新的」+ 灰掉的按钮，那个改名**永远推不上去**（自动同步同样会跳过）——
 * 一个为了数字好看而制造出来的死角。所以这里跟出厂值逐字段比对，改过的算用户的。
 */
export type PendingCounts = {
  transactions: number;
  /** 用户自己建的，加上**被改过**的内置分类 */
  categories: number;
  accounts: number;
  transfers: number;
  recurring: number;
};

export type LocalStats = {
  transactions: number;
  /** 还没备份过的**账单**笔数（`synced = 0`）。 */
  unsynced: number;
  /** 按种类分开的待推送数，备份确认层逐行列出来用 */
  pending: PendingCounts;
  /** `pending` 五项之和。卡上那个「未备份」和确认层的总数用它 */
  unsyncedTotal: number;
  /** 还没上过云端、而且**一个字都没被改过**的内置分类和账户。不计进 unsyncedTotal，
   *  数字也不显示——只用来决定备份确认层底下那句脚注要不要出现 */
  pendingBuiltins: number;
  /** 最早一笔账的日期，用来算「记账第 N 天」。一笔都没有时是 null，那一行就不显示 */
  firstTransactionDate: string | null;
};

const BUILTIN_CATEGORY_IDS = DEFAULT_CATEGORIES_FLAT.map((category) => category.id);
const BUILTIN_ACCOUNT_IDS = Object.values(DEFAULT_ACCOUNTS).map((account) => account.id);
const SHIPPED_CATEGORIES = new Map(DEFAULT_CATEGORIES_FLAT.map((category) => [category.id, category]));
// 显式给 key 标 string：DEFAULT_ACCOUNTS 是 as const，不标的话 key 的类型会窄成那两个字面量 id
const SHIPPED_ACCOUNTS = new Map<string, { id: string; name: string }>(
  Object.values(DEFAULT_ACCOUNTS).map((account) => [account.id, account]),
);
const BUILTIN_CATEGORY_ID_SET = new Set<string>(BUILTIN_CATEGORY_IDS);
const BUILTIN_ACCOUNT_ID_SET = new Set<string>(BUILTIN_ACCOUNT_IDS);

export async function getLocalStats(): Promise<LocalStats> {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    total: number;
    unsynced: number;
    firstDate: string | null;
    pendingTransactions: number;
    pendingTransfers: number;
    pendingRecurring: number;
  }>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN synced = 0 THEN 1 ELSE 0 END) AS unsynced,
            MIN(date) AS firstDate,
            (SELECT COUNT(*) FROM transactions WHERE synced = 0) AS pendingTransactions,
            (SELECT COUNT(*) FROM transfers WHERE synced = 0) AS pendingTransfers,
            (SELECT COUNT(*) FROM recurring_transactions WHERE synced = 0) AS pendingRecurring
       FROM transactions`,
  );

  /**
   * 分类和账户**不按 `synced` 数，按内容指纹**跟上次推上去的那份比。
   *
   * `synced` 记的是"动过没有"：把一个分类改名再改回来，它是 0，但那一行跟云端一模一样，
   * 而备份层会一直显示"要上传的分类 1 条"。指纹问的是"跟推上去的那份一不一样"，
   * 改一圈又改回去算不出差别（见 db/sync-fingerprint.ts）。
   *
   * 全表读进来在 JS 里比：指纹是拼出来的字符串，SQL 算不出来。这两张表各几十行，
   * 而账单那几千行继续走 `synced = 0` 的老路——每次刷新都给它们算一遍指纹不值得。
   */
  const categoryRows = await db.getAllAsync<CategoryFingerprintRow & { syncedFingerprint: string | null }>(
    `SELECT id, name, icon, type, parentId, sortOrder, isActive, syncedFingerprint FROM categories`,
  );
  const accountRows = await db.getAllAsync<AccountFingerprintRow & { syncedFingerprint: string | null }>(
    `SELECT id, name, type, currency, openingBalance, icon, syncedFingerprint FROM accounts`,
  );

  // 脏行再分两拨：原封不动的内置项是骨架（不计数、不显示），其余都算用户自己的数据。
  // "跟出厂值一不一样"同样只能在 JS 里比——出厂值在常量文件里，不在库里
  const categorySplit = splitPending(
    categoryRows.filter((category) => category.syncedFingerprint !== categoryFingerprint(category)),
    (category) => BUILTIN_CATEGORY_ID_SET.has(category.id) && isCategoryAsShipped(category),
  );
  const accountSplit = splitPending(
    accountRows.filter((account) => account.syncedFingerprint !== accountFingerprint(account)),
    (account) => BUILTIN_ACCOUNT_ID_SET.has(account.id) && isAccountAsShipped(account),
  );

  const pending: PendingCounts = {
    transactions: row?.pendingTransactions ?? 0,
    categories: categorySplit.mine,
    accounts: accountSplit.mine,
    transfers: row?.pendingTransfers ?? 0,
    recurring: row?.pendingRecurring ?? 0,
  };

  return {
    transactions: row?.total ?? 0,
    unsynced: row?.unsynced ?? 0,
    pending,
    unsyncedTotal: Object.values(pending).reduce((sum, count) => sum + count, 0),
    pendingBuiltins: categorySplit.skeleton + accountSplit.skeleton,
    firstTransactionDate: row?.firstDate ?? null,
  };
}

type BuiltinCategoryRow = {
  id: string;
  name: string;
  icon: string | null;
  parentId: string | null;
  // 库里是 0/1，而推送前那一步会把它转成 boolean——两种都收，下面用 !! 归一
  isActive: number | boolean;
};
type BuiltinAccountRow = { id: string; name: string; openingBalance: number };

/**
 * 把"还没推上去的行"分成两拨：`skeleton` 是原封不动的内置项（云端得先有这一行，
 * 账单的外键才落得下，但它不是用户能决定要不要传的东西），`mine` 是其余的。
 * 只有 `mine` 进用户看到的计数。
 */
function splitPending<T>(rows: T[], isSkeleton: (row: T) => boolean) {
  const skeleton = rows.filter(isSkeleton).length;
  return { mine: rows.length - skeleton, skeleton };
}

/**
 * 这一行还跟出厂时一模一样吗。
 *
 * **不比 sortOrder**：拖动排序也会置 `synced = 0`，但只拖过顺序、别的什么都没做，
 * 算不算"我有东西还没备份"很难说得清，而顺序本身会跟着下一次推送一起上去
 * （`pushUnsynced` 推的是所有 `synced = 0` 的行，不看这里的计数）。
 * 比它的代价是得在这里重算一遍灌种子时的序号规则——两份规则迟早分叉。
 */
export function isCategoryAsShipped(row: BuiltinCategoryRow): boolean {
  const shipped = SHIPPED_CATEGORIES.get(row.id);
  if (!shipped) return false;
  return (
    row.name === shipped.name &&
    row.icon === shipped.icon &&
    (row.parentId ?? null) === shipped.parentId &&
    !!row.isActive
  );
}

// 账户只比用户能改的那两样：界面上 type 和 currency 是只读的（见 accounts.ts 的 updateAccount）
export function isAccountAsShipped(row: BuiltinAccountRow): boolean {
  const shipped = SHIPPED_ACCOUNTS.get(row.id);
  if (!shipped) return false;
  return row.name === shipped.name && row.openingBalance === 0;
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
    // 按上面查出来的分类去收图，不是把整个目录打包：目录里可能还躺着没被对账收走的孤儿
    categoryIcons: await collectCategoryIconBlobs(categories.map((category) => category.icon)),
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
    categoryIcons: bundle.categoryIcons ?? [],
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

/**
 * 包里这一行跟本地那一行**内容上**是不是同一个样子。id 和 type 不比——
 * 能走到这里就是同一个 id，而 type 改不了（界面上没有这个入口，改了也就是另一个分类了）。
 *
 * 比的是用户看得见的那五样：名字、图标、挂在谁下面、排第几、停不停用。
 * 任何一样不同，这一行就该被包里的版本覆盖。
 *
 * `isActive` 用 `!!` 归一：本地存的是 SQLite 的 0/1，而手改过的 JSON 文件里可能是 true/false，
 * 不归一的话 `1 !== true`，每一行都会被判成"不一样"，于是每次恢复都把整张表重写一遍。
 */
function isSameCategory(local: CategoryRow, source: CategoryRow): boolean {
  return (
    local.name === source.name &&
    (local.icon ?? null) === (source.icon ?? null) &&
    (local.parentId ?? null) === (source.parentId ?? null) &&
    (local.sortOrder ?? 0) === (source.sortOrder ?? 0) &&
    !!local.isActive === !!source.isActive
  );
}

export type CategoryResolution = {
  source: CategoryRow;
  /** 来源里这个分类底下有多少笔账（给对照页显示"这条选错会影响多少账"） */
  transactionCount: number;
  /** exists = 本地已有同一个 id；matched = 按名字对上了本地另一个 id；create = 本地没有，照建 */
  action: 'exists' | 'matched' | 'create';
  /**
   * 只对 `exists` 有意义。两个字段是**三方合并**的两种结局，互斥：
   *
   * - `differs`：包里那份跟本地不一样，而**本地自上次同步以来没被动过** → 采用包里的
   * - `conflict`：包里那份跟本地不一样，而本地也改过 → **保留本地**，等下次推送把它送上去
   *
   * 两个都 false 就是无事发生（两边内容一致）。
   *
   * 算在 planImport 里而不是各自判断一次：预览上承诺"更新 N 个分类"、结果页兑现同一个 N，
   * 两处读的必须是同一个判断。这个文件开头那条"分两套实现，数字迟早对不上"说的就是它。
   */
  differs: boolean;
  conflict: boolean;
  targetId: string;
  /** 只有"按名字猜"出来的才需要用户确认（CSV、两台手机合并）。JSON 包里 id 是权威的，不用问 */
  needsChoice: boolean;
};

export type ImportPlan = {
  bundle: BackupBundle;
  categories: CategoryResolution[];
  newAccounts: number;
  newTransactions: number;
  duplicateTransactions: number;
  /** 本地还没设过预算时才会带上它，不覆盖用户当前填的数 */
  budgetToRestore: number | null;
};

export async function planImport(bundle: BackupBundle): Promise<ImportPlan> {
  const db = await getDb();

  const localCategories = await db.getAllAsync<CategoryRow & { synced: number; syncedFingerprint: string | null }>(
    'SELECT * FROM categories',
  );
  const localAccounts = await db.getAllAsync<{ id: string; name: string }>('SELECT id, name FROM accounts');
  const localTransactionIds = new Set(
    (await db.getAllAsync<{ id: string }>('SELECT id FROM transactions')).map((row) => row.id),
  );

  // 图片先落地，再进事务写库。文件系统没有回滚，跟 SQLite 凑不成一个原子操作，
  // 所以只能挑一个错得轻的顺序：先图后库，崩在中间留下的是几个没人用的文件（下次写分类时对账收走）；
  // 反过来则是一批指向空气的引用，用户看到一排 📦，而且自己修不好。
  // 包里没有这个字段（老版本导出的）时这一步什么都不做
  await restoreCategoryIconBlobs(bundle.categoryIcons ?? []);
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

  const categories: CategoryResolution[] = bundle.categories.map((source) => {
    const transactionCount = countByCategory.get(source.id) ?? 0;

    const local = localById.get(source.id);
    if (local) {
      /**
       * 三方合并的判断放在这里，恢复和备份走的是同一条规则（见 db/sync-merge.ts 的表）。
       *
       * 曾经这里是"包里不一样就覆盖"，一刀切。那条规则修好了一个 bug（A 机换了图标、
       * B 机恢复后原样不动），却造出另一个：**本地改了但还没推，先点了恢复**——
       * 那些改动会被一份更旧的包直接盖掉，而用户完全不知道。
       * 两个场景的区别只有一个问题答得了："本地这一行，自上次同步以来动过没有。"
       */
      const sameAsBundle = isSameCategory(local, source);
      const localUntouched = isUntouchedSinceSync(local, categoryFingerprint(local), () =>
        isCategoryAsShipped(local),
      );
      return {
        source,
        transactionCount,
        action: 'exists',
        differs: !sameAsBundle && localUntouched,
        conflict: !sameAsBundle && !localUntouched,
        targetId: source.id,
        needsChoice: false,
      };
    }

    // 没有 id 能对上时才退到按名字猜。CSV 那条路上每一行都会走到这里
    // （differs 只对 exists 有意义，另外两支一律 false）
    const matched = localByPath.get(
      pathKey(source.type, source.parentId ? (sourceNameById.get(source.parentId) ?? null) : null, source.name),
    );
    if (matched) {
      return {
        source,
        transactionCount,
        action: 'matched',
        differs: false,
        conflict: false,
        targetId: matched.id,
        needsChoice: false,
      };
    }

    return {
      source,
      transactionCount,
      action: 'create',
      differs: false,
      conflict: false,
      targetId: source.id,
      needsChoice: false,
    };
  });

  const localAccountIds = new Set(localAccounts.map((account) => account.id));
  const localAccountByName = new Map(localAccounts.map((account) => [account.name, account.id]));
  const newAccounts = bundle.accounts.filter(
    (account) => !localAccountIds.has(account.id) && !localAccountByName.has(account.name),
  ).length;

  const newTransactions = bundle.transactions.filter((transaction) => !localTransactionIds.has(transaction.id)).length;

  return {
    bundle,
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
  /** 新建的分类 */
  categories: number;
  /** 本地已有、这次被包里的版本更新掉的分类 */
  categoriesUpdated: number;
  /** 两边都改过、这次保留了本地那一份的分类。它们仍然是「未备份」，下次推送会送上去 */
  categoriesKept: number;
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
/**
 * @param source 这份包从哪来，决定写进去的行算不算"已经备份过"。
 *   **云端来的一律算已备份**（`synced = 1`）：它们本来就是从这个账号的服务器上拉下来的，
 *   再当成"待上传"的话，恢复完 2 笔账，备份卡立刻显示「2 条未备份」，
 *   点进去还能把刚下载的东西再上传一遍——一个自己跟自己较劲的循环。
 *   **文件来的算没备份过**（`synced = 0`）：一个 .json 文件说明不了服务器上有没有这些行，
 *   宁可多推一次也不能漏——服务器按 id 幂等去重，推重了不会变两份（CLAUDE.md 原则#2）。
 */
export async function applyImport(
  plan: ImportPlan,
  choices: Record<string, string> = {},
  source: ImportSource = 'file',
): Promise<ImportResult> {
  const db = await getDb();
  const { bundle } = plan;
  const synced = source === 'cloud' ? 1 : 0;

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

  /**
   * 这一行写下去之后，`syncedFingerprint` 该记什么。
   *
   * **只有云端来源才有得记**：那份包就是服务器此刻的样子，所以落库的同时就能说
   * "这一行跟云端一致"。从文件恢复的包不是——它可能是三个月前导出的，
   * 服务器上早就不是这个样子了，所以留 null（= 从没推上去过 → 待上传）。
   *
   * **id 或 parentId 被改写过的行也留 null**：指纹描述的是"服务器上那一行"，
   * 而改写之后本地这一行跟服务器就不是同一个东西了。往"算作待上传"的方向错是安全的
   * （多推一次，服务器 upsert 幂等）；反过来错则是改动永远上不去，而且界面上看不出来。
   */
  const fingerprintFor = (row: CategoryRow, targetId: string, parentId: string | null): string | null => {
    if (synced !== 1) return null;
    if (targetId !== row.id || parentId !== (row.parentId ?? null)) return null;
    return categoryFingerprint({ ...row, parentId, sortOrder: row.sortOrder ?? 0, isActive: row.isActive ?? 1 });
  };

  const result: ImportResult = {
    transactions: 0,
    skipped: 0,
    categories: 0,
    categoriesUpdated: 0,
    categoriesKept: 0,
    accounts: 0,
    transfers: 0,
    recurring: 0,
    budgetRestored: null,
  };

  await db.withTransactionAsync(async () => {
    // 分类：父必须先落地，子的 parentId 才有指向。bundle 里已经是父在前，
    // 这里再排一次是为了不依赖来源的顺序（手改过的文件、以后换个服务器实现都可能乱序）
    const ordered = [...bundle.categories].sort((a, b) => Number(!!a.parentId) - Number(!!b.parentId));
    // 循环变量叫 row 不叫 source：source 现在是函数参数（这份包从哪来）
    for (const row of ordered) {
      const resolution = plan.categories.find((item) => item.source.id === row.id);
      if (!resolution) continue;

      const targetId = idMap.get(row.id) ?? row.id;
      const parentId = row.parentId ? (idMap.get(row.parentId) ?? row.parentId) : null;

      if (resolution.action === 'create' && !choices[row.id]) {
        await db.runAsync(
          `INSERT OR IGNORE INTO categories
             (id, name, icon, type, parentId, sortOrder, isActive, synced, syncedFingerprint)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            targetId,
            row.name,
            row.icon,
            row.type,
            parentId,
            row.sortOrder ?? 0,
            row.isActive ?? 1,
            synced,
            fingerprintFor(row, targetId, parentId),
          ],
        );
        result.categories += 1;
        continue;
      }

      /**
       * 本地已经有这个 id：**只在本地那一行自上次同步以来没被动过时**，才用包里的版本覆盖。
       *
       * 两个真实场景各自的诉求，被这一个条件同时满足：
       * - A 机给「FGO」换了图、推上云端，B 机（已经有账）恢复 → B 上那一行没人动过，
       *   采用包里的，图标跟着变。原来这里整行跳过，图其实已经下到沙盒里，
       *   只是没人引用，下一次分类写操作就被当孤儿扫掉。
       * - 本地改了分类、还没推，先点了恢复 → 那一行动过，**保留本地**；
       *   它仍然是「未备份」，下次推送照样送上去，一个字都不会丢。
       *
       * `differs` / `conflict` 由 planImport 算好，预览承诺的数字和这里实际写的是同一个判断。
       * 全等的行两个都是 false，不写，也就不会白白把 synced 置回 0。
       */
      if (resolution.conflict) {
        result.categoriesKept += 1;
        continue;
      }

      if (resolution.action === 'exists' && resolution.differs) {
        await db.runAsync(
          `UPDATE categories
              SET name = ?, icon = ?, parentId = ?, sortOrder = ?, isActive = ?, synced = ?, syncedFingerprint = ?
            WHERE id = ?`,
          [
            row.name,
            row.icon,
            parentId,
            row.sortOrder ?? 0,
            row.isActive ?? 1,
            synced,
            fingerprintFor(row, targetId, parentId),
            targetId,
          ],
        );
        result.categoriesUpdated += 1;
      }
    }

    for (const account of bundle.accounts) {
      const targetId = accountMap.get(account.id) ?? account.id;
      if (localAccountIds.has(targetId) || localAccountByName.has(account.name)) continue;
      await db.runAsync(
        `INSERT OR IGNORE INTO accounts
           (id, name, type, currency, openingBalance, icon, createdAt, synced, syncedFingerprint)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          targetId,
          account.name,
          account.type ?? 'OTHER',
          account.currency ?? 'MYR',
          account.openingBalance ?? 0,
          account.icon ?? null,
          account.createdAt ?? new Date().toISOString(),
          synced,
          // 同分类：只有云端来源、且 id 没被改写过，才说得上"跟云端一致"
          synced === 1 && targetId === account.id
            ? accountFingerprint({
                id: targetId,
                name: account.name,
                type: account.type ?? 'OTHER',
                currency: account.currency ?? 'MYR',
                openingBalance: account.openingBalance ?? 0,
                icon: account.icon ?? null,
              })
            : null,
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

      // synced 跟着来源走，见函数头上那段
      await db.runAsync(
        `INSERT OR IGNORE INTO transactions
           (id, title, remarks, amount, currency, exchangeRate, amountInBase, type, date, tags,
            isReimbursable, excludeFromStats, categoryId, accountId, recurringId, createdAt, updatedAt,
            merchant, location, reimbursedAt, synced)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          synced,
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
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          transfer.id as string,
          transfer.amount as number,
          transfer.date as string,
          (transfer.note as string) ?? null,
          accountMap.get(transfer.fromAccountId as string) ?? (transfer.fromAccountId as string),
          accountMap.get(transfer.toAccountId as string) ?? (transfer.toAccountId as string),
          (transfer.createdAt as string) ?? new Date().toISOString(),
          synced,
        ],
      );
      result.transfers += 1;
    }

    for (const rule of bundle.recurring) {
      await db.runAsync(
        `INSERT OR IGNORE INTO recurring_transactions
           (id, title, remarks, amount, currency, exchangeRate, type, frequency, startDate, nextRunDate,
            endDate, isActive, categoryId, accountId, createdAt, synced)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          synced,
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
