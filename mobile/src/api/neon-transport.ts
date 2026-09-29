import * as Crypto from 'expo-crypto';

import type { BackupBundle } from '@/db/backup';
import type { CategoryIconBlob } from '@/db/category-icon-files';
import { describeNeonError, requireBookId, requireSql, stampPush } from '@/db/neon/client';

import type { BatchResult, CloudAccount, CloudCategory, CloudSummary, CloudTransport } from './cloud-transport';

/**
 * 直连用户自己那个 Neon 库的传输层实现。
 *
 * 它跟 `api/sync.ts` 是**同一个接口的两个实现**（见 api/cloud-transport.ts），
 * 所以 `db/sync.ts` 里那套"什么该推、按什么顺序推、推完怎么标记"一行都不用改。
 * 这里只回答一件事：同样的数据，用 SQL 怎么写进去、怎么读回来。
 *
 * ## 三条贯穿全文的规则
 *
 * 1. **每一行都带 userId**，取自 `app_meta.bookId`。一个库一个账本的话它恒等于同一个值，
 *    但 `Category` / `Account` 的主键是 `(userId, id)` 复合键，少了它连不上（CLAUDE.md 原则#2）。
 *
 * 2. **全部是 upsert（`ON CONFLICT DO UPDATE`）**，跟后端那条路一致。同步会重试，
 *    重推一次的结果必须跟推一次完全一样——客户端生成 id 存在的理由就是这个。
 *
 * 3. **整行覆盖，null 照写**。`db/sync.ts` 顶上那段说得很清楚：少送一个字段不等于
 *    "这个字段没变"，等于"保持云端的旧值"。所以 `DO UPDATE SET` 要列全所有可变列，
 *    漏一个就是一类"改了但同步不上去、还不报错"的 bug。
 *
 * ## 为什么图片用 base64 进出，而不是在 JS 里转字节
 *
 * `CategoryIcon.data` 是 bytea，而 React Native 里没有 `Buffer`。与其引一个 polyfill，
 * 不如让 Postgres 自己转：写的时候 `decode($n, 'base64')`，读的时候 `encode(data, 'base64')`。
 * 两头都是字符串，中间一个字节都不用在 JS 里碰。
 */

// ---- 批量 upsert 的拼装 ----

type Column = { name: string; value: (row: Record<string, unknown>) => unknown };

/**
 * 一条语句写一整批。
 *
 * 不是循环里发 N 个请求：HTTP 驱动一次请求一个来回，一百条账单就是一百个来回，
 * 在手机网络上这是几十秒和一秒的差别。Postgres 的参数上限是 65535 个，
 * 账单一行 19 列、一批 100 行 = 1900 个，还差得远。
 *
 * `RETURNING (xmax = 0)` 是分辨"这一行是插进去的还是改掉的"的标准写法：
 * 新插入的行 xmax 是 0，被 DO UPDATE 改掉的不是。界面上那句「新增 12 条、更新 3 条」
 * 就靠它——自己在本地猜一个数字，早晚跟云端实际发生的事对不上。
 */
function buildUpsert(
  table: string,
  columns: Column[],
  rows: Record<string, unknown>[],
  conflictTarget: string,
  updatable: string[],
): { text: string; params: unknown[] } {
  const params: unknown[] = [];
  const tuples = rows.map((row) => {
    const placeholders = columns.map((column) => {
      params.push(column.value(row));
      return `$${params.length}`;
    });
    return `(${placeholders.join(', ')})`;
  });

  const columnList = columns.map((column) => `"${column.name}"`).join(', ');
  const setClause = updatable.map((name) => `"${name}" = EXCLUDED."${name}"`).join(', ');

  return {
    text: `INSERT INTO "${table}" (${columnList}) VALUES ${tuples.join(', ')}
           ON CONFLICT (${conflictTarget}) DO UPDATE SET ${setClause}
           RETURNING (xmax = 0) AS inserted`,
    params,
  };
}

function tally(rows: Record<string, unknown>[]): BatchResult {
  const inserted = rows.filter((row) => row.inserted === true).length;
  return { inserted, updated: rows.length - inserted };
}

/** 直接取值的列。绝大多数列都是这种，单独写个工具省掉一堆 `(row) => row.x` */
function plain(name: string): Column {
  return { name, value: (row) => row[name] ?? null };
}

/** 本地存的是 0/1，Postgres 那边是 BOOLEAN */
function bool(name: string): Column {
  return { name, value: (row) => !!row[name] };
}

/**
 * 每条语句都过这里，为的是把 Postgres 的原始报错翻成一句能照着做的话。
 *
 * 外键违例在这条路上是**会真的发生**的（云端还没有那个分类、或者那个分类被别的账单占着删不掉），
 * 而 Postgres 给的是一句带约束名的英文。用户看到 `Transaction_category_fkey` 只会困惑。
 */
async function run(text: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  const sql = await requireSql();
  try {
    return (await sql.query(text, params)) as Record<string, unknown>[];
  } catch (error) {
    throw new Error(describeSqlError(error));
  }
}

function describeSqlError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);

  if (raw.includes('_category_fkey')) return '云端还没有这条账单用的分类，下次备份会先推分类再重试';
  if (raw.includes('_account_fkey')) return '云端还没有这条账单用的账户，下次备份会先推账户再重试';
  if (raw.includes('Category_parent_fkey')) return '子分类的上级还没推上去，下次备份会按父子顺序重试';
  if (raw.includes('violates foreign key constraint') && raw.includes('is still referenced')) {
    return '这个分类或账户还被云端的账单用着，删不掉。先把那些账单改到别的分类下';
  }
  if (raw.includes('relation') && raw.includes('does not exist')) {
    return '云端的表不见了。去「云端备份」页重新连一次，会自动把表补建回来';
  }
  return describeNeonError(error);
}

// ---- 推上去 ----

async function pushCategories(categories: Record<string, unknown>[]): Promise<BatchResult> {
  if (!categories.length) return { inserted: 0, updated: 0 };
  const userId = await requireBookId();

  const { text, params } = buildUpsert(
    'Category',
    [
      plain('id'),
      plain('name'),
      plain('icon'),
      plain('type'),
      plain('parentId'),
      plain('sortOrder'),
      bool('isActive'),
      { name: 'userId', value: () => userId },
    ],
    categories,
    '"userId", "id"',
    ['name', 'icon', 'type', 'parentId', 'sortOrder', 'isActive'],
  );

  const result = tally(await run(text, params));

  // 分类推完才扫孤儿图标，理由跟后端那份一字不差（见 backend categoryIcon.service 的 pruneOrphans）：
  // 备份的顺序是先传图后推分类，在传图那一步扫会把刚上来的图当场删掉——
  // 只有这一刻，云端的分类表才是手机此刻的样子
  await pruneOrphanIcons(userId);
  return result;
}

async function pushAccounts(accounts: Record<string, unknown>[]): Promise<BatchResult> {
  if (!accounts.length) return { inserted: 0, updated: 0 };
  const userId = await requireBookId();

  const { text, params } = buildUpsert(
    'Account',
    [
      plain('id'),
      plain('name'),
      plain('type'),
      plain('currency'),
      plain('openingBalance'),
      plain('icon'),
      { name: 'userId', value: () => userId },
    ],
    accounts,
    '"userId", "id"',
    ['name', 'type', 'currency', 'openingBalance', 'icon'],
  );

  return tally(await run(text, params));
}

async function pushTransactions(transactions: Record<string, unknown>[]): Promise<BatchResult> {
  if (!transactions.length) return { inserted: 0, updated: 0 };
  const userId = await requireBookId();

  const { text, params } = buildUpsert(
    'Transaction',
    [
      plain('id'),
      plain('title'),
      plain('merchant'),
      plain('location'),
      plain('remarks'),
      plain('amount'),
      plain('currency'),
      plain('exchangeRate'),
      plain('amountInBase'),
      plain('type'),
      plain('date'),
      // 本地那一列是一段 JSON 文本，db/sync.ts 已经解析成数组了；驱动会把它序列化成 TEXT[]
      { name: 'tags', value: (row) => (Array.isArray(row.tags) ? row.tags : []) },
      bool('isReimbursable'),
      plain('reimbursedAt'),
      bool('excludeFromStats'),
      plain('categoryId'),
      plain('accountId'),
      plain('recurringId'),
      { name: 'userId', value: () => userId },
      // Prisma 的 @updatedAt 是应用层行为，裸 SQL 这边没人替我们盖，只能自己盖
      { name: 'updatedAt', value: () => new Date().toISOString() },
    ],
    transactions,
    '"id"',
    [
      'title', 'merchant', 'location', 'remarks', 'amount', 'currency', 'exchangeRate',
      'amountInBase', 'type', 'date', 'tags', 'isReimbursable', 'reimbursedAt',
      'excludeFromStats', 'categoryId', 'accountId', 'recurringId', 'updatedAt',
    ],
  );

  const result = tally(await run(text, params));
  await replaceImages(transactions);
  return result;
}

/**
 * 收据图的网址跟着账单一起走。
 *
 * **先删后插**，不 upsert：本地根本不给这些行发 id（db/sync.ts 只查 transactionId 和 url），
 * 所以没有可以 ON CONFLICT 的键。而"这笔账现在有哪几张图"本来就是整体替换的语义——
 * 用户删掉一张图之后，云端那一行必须跟着消失。
 *
 * 只动这一批账单的图，不碰别的：`WHERE "transactionId" = ANY($1)`。
 */
async function replaceImages(transactions: Record<string, unknown>[]): Promise<void> {
  const ids = transactions.map((transaction) => transaction.id as string);
  const rows = transactions.flatMap((transaction) => {
    const images = Array.isArray(transaction.images) ? transaction.images : [];
    return images.map((image) => ({
      id: Crypto.randomUUID(),
      url: (image as { url: string }).url,
      transactionId: transaction.id as string,
    }));
  });

  await run('DELETE FROM "TransactionImage" WHERE "transactionId" = ANY($1)', [ids]);
  if (!rows.length) return;

  const params: unknown[] = [];
  const tuples = rows.map((row) => {
    params.push(row.id, row.url, row.transactionId);
    return `($${params.length - 2}, $${params.length - 1}, $${params.length})`;
  });
  await run(`INSERT INTO "TransactionImage" ("id", "url", "transactionId") VALUES ${tuples.join(', ')}`, params);
}

async function pushTransfers(transfers: Record<string, unknown>[]): Promise<BatchResult> {
  if (!transfers.length) return { inserted: 0, updated: 0 };
  const userId = await requireBookId();

  const { text, params } = buildUpsert(
    'Transfer',
    [
      plain('id'),
      plain('amount'),
      plain('date'),
      plain('note'),
      plain('fromAccountId'),
      plain('toAccountId'),
      { name: 'userId', value: () => userId },
    ],
    transfers,
    '"id"',
    ['amount', 'date', 'note', 'fromAccountId', 'toAccountId'],
  );

  return tally(await run(text, params));
}

/** 周期规则是用户一条一条建的，同时脏一批的场景不存在，所以这条跟后端那边一样是单条 */
async function pushRecurring(rule: Record<string, unknown>): Promise<void> {
  const userId = await requireBookId();

  const { text, params } = buildUpsert(
    'RecurringTransaction',
    [
      plain('id'),
      plain('title'),
      plain('remarks'),
      plain('amount'),
      plain('currency'),
      plain('exchangeRate'),
      plain('type'),
      plain('frequency'),
      plain('startDate'),
      plain('nextRunDate'),
      plain('endDate'),
      bool('isActive'),
      plain('categoryId'),
      plain('accountId'),
      { name: 'userId', value: () => userId },
    ],
    [rule],
    '"id"',
    [
      'title', 'remarks', 'amount', 'currency', 'exchangeRate', 'type', 'frequency',
      'startDate', 'nextRunDate', 'endDate', 'isActive', 'categoryId', 'accountId',
    ],
  );

  await run(text, params);
}

/**
 * 在云端删掉一条。**删不到当成成功**，跟 HTTP 那条路把 404 当成功是同一个道理：
 * 目标是"让它不存在"，本来就不存在的话这个目标已经达到了。
 * 当成失败的话，那块墓碑永远撤不掉，每次备份都在同一条上重试。
 */
async function deleteRemote(kind: 'transaction' | 'category' | 'account', id: string): Promise<void> {
  const userId = await requireBookId();
  const table = { transaction: 'Transaction', category: 'Category', account: 'Account' }[kind];
  await run(`DELETE FROM "${table}" WHERE "userId" = $1 AND "id" = $2`, [userId, id]);
}

// ---- 分类图标 ----

async function fetchCloudIconNames(): Promise<string[]> {
  const userId = await requireBookId();
  const rows = await run('SELECT "name" FROM "CategoryIcon" WHERE "userId" = $1 ORDER BY "createdAt" ASC', [userId]);
  return rows.map((row) => row.name as string);
}

/**
 * 从头几个字节认图片格式，**不信调用方说自己是什么**。
 *
 * 后端那边是把 base64 解成 Buffer 再比字节（categoryIcon.service 的 sniffMimeType），
 * 这里没有 Buffer，所以比的是 base64 编码后的前缀——base64 每 3 个字节编成 4 个字符，
 * 所以固定的文件头会编成固定的前缀：JPEG 的 `FF D8 FF` 是 `/9j/`，
 * PNG 的 `89 50 4E 47` 是 `iVBORw0KGgo`。认不出来的不传，跟后端一样只收这两种。
 */
function sniffMimeType(base64: string): string | null {
  if (base64.startsWith('/9j/')) return 'image/jpeg';
  if (base64.startsWith('iVBORw0KGgo')) return 'image/png';
  return null;
}

/**
 * 传图上去。**已经在的跳过，不覆盖**：文件名是手机端生成的 UUID，换一张图就是换一个名字，
 * 所以同名必然同图（见 backend 的 batchUpload）。
 *
 * `size` 交给 Postgres 自己数（`octet_length`），不在 JS 里根据 base64 长度反推——
 * 反推要处理末尾的 `=` 补位，算错了会在"这个账号占了多少空间"上留下一个没人会去核对的偏差。
 */
async function pushCategoryIcons(
  icons: { name: string; data: string }[],
): Promise<{ inserted: number; skipped: number }> {
  const userId = await requireBookId();
  const valid = icons.filter((icon) => !!sniffMimeType(icon.data));
  if (!valid.length) return { inserted: 0, skipped: icons.length };

  const params: unknown[] = [];
  const tuples = valid.map((icon) => {
    params.push(userId, icon.name, sniffMimeType(icon.data), icon.data);
    const base = params.length - 3;
    return `($${base}, $${base + 1}, $${base + 2}, decode($${base + 3}, 'base64'), octet_length(decode($${base + 3}, 'base64')))`;
  });

  const rows = await run(
    `INSERT INTO "CategoryIcon" ("userId", "name", "mimeType", "data", "size")
     VALUES ${tuples.join(', ')}
     ON CONFLICT ("userId", "name") DO NOTHING
     RETURNING "name"`,
    params,
  );

  return { inserted: rows.length, skipped: icons.length - rows.length };
}

async function fetchCategoryIconBlobs(names: string[]): Promise<CategoryIconBlob[]> {
  if (!names.length) return [];
  const userId = await requireBookId();
  const rows = await run(
    `SELECT "name", "mimeType", encode("data", 'base64') AS "data"
       FROM "CategoryIcon" WHERE "userId" = $1 AND "name" = ANY($2)`,
    [userId, names],
  );
  return rows as unknown as CategoryIconBlob[];
}

/**
 * 把头像写进 `User` 那一行。`data` 传 null 就是用户把头像删了，那一列跟着清空。
 *
 * **两种"没有"在这里必须分得开**：调用方压根不调这个函数 = 头像没换过；
 * 调了但 data 是 null = 头像被删了。合成一种的话，删头像这件事永远同步不出去。
 */
async function pushAvatar(data: string | null): Promise<void> {
  const userId = await requireBookId();
  if (!data) {
    await run('UPDATE "User" SET "avatar" = NULL, "avatarMime" = NULL WHERE "id" = $1', [userId]);
    return;
  }
  await run(`UPDATE "User" SET "avatar" = decode($2, 'base64'), "avatarMime" = $3 WHERE "id" = $1`, [
    userId,
    data,
    sniffMimeType(data) ?? 'image/jpeg',
  ]);
}

/** 云端那张头像的 base64，没设过返回 null */
async function fetchAvatar(): Promise<string | null> {
  const userId = await requireBookId();
  const rows = await run(`SELECT encode("avatar", 'base64') AS "data" FROM "User" WHERE "id" = $1`, [userId]);
  return (rows[0]?.data as string | null) ?? null;
}

/** 没有任何分类在引用的图标。理由和触发时机见 pushCategories 那一段 */
async function pruneOrphanIcons(userId: string): Promise<void> {
  await run(
    `DELETE FROM "CategoryIcon" icon
      WHERE icon."userId" = $1
        AND NOT EXISTS (
          SELECT 1 FROM "Category" category
           WHERE category."userId" = icon."userId"
             AND category."icon" = 'custom:' || icon."name"
        )`,
    [userId],
  );
}

// ---- 读回来 ----

/**
 * Postgres 的时间列经过驱动之后可能已经是 Date 了，也可能还是字符串。
 * 两种都收，统一吐 ISO——恢复那一头（db/backup.ts）要的是本地 SQLite 的口径，也就是字符串。
 */
function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** Decimal 列过 HTTP 之后是字符串，不是数字 */
function toNumber(value: unknown): number {
  return Number(value ?? 0);
}

async function fetchCloudCategories(): Promise<CloudCategory[]> {
  const userId = await requireBookId();
  const rows = await run(
    `SELECT "id", "name", "icon", "type", "parentId", "sortOrder", "isActive"
       FROM "Category" WHERE "userId" = $1 ORDER BY "sortOrder" ASC, "name" ASC`,
    [userId],
  );
  return rows as unknown as CloudCategory[];
}

async function fetchCloudAccounts(): Promise<CloudAccount[]> {
  const userId = await requireBookId();
  const rows = await run(
    `SELECT "id", "name", "type", "currency", "openingBalance", "icon"
       FROM "Account" WHERE "userId" = $1 ORDER BY "createdAt" ASC`,
    [userId],
  );
  return rows as unknown as CloudAccount[];
}

async function fetchCloudSummary(): Promise<CloudSummary> {
  const userId = await requireBookId();
  const [row] = await run(
    `SELECT
       (SELECT COUNT(*) FROM "Transaction" WHERE "userId" = $1) AS transactions,
       (SELECT COUNT(*) FROM "Category"    WHERE "userId" = $1) AS categories,
       (SELECT COUNT(*) FROM "Account"     WHERE "userId" = $1) AS accounts,
       (SELECT MAX("createdAt") FROM "Transaction" WHERE "userId" = $1) AS "lastUploadAt"`,
    [userId],
  );

  return {
    transactions: toNumber(row?.transactions),
    categories: toNumber(row?.categories),
    accounts: toNumber(row?.accounts),
    lastUploadAt: toIso(row?.lastUploadAt),
  };
}

/**
 * 整包拉回来，喂给 `planImport`。
 *
 * **字段的表示法照着本地 SQLite 的口径来**：布尔写成 0/1、标签写成 JSON 字符串、
 * 时间写成 ISO 字符串、金额写成数字。这不是随便定的，是为了让这份包跟手机导出的 .json
 * **一模一样**，恢复那边只有一套代码（CLAUDE.md 原则#3）。后端那条路上同一个函数
 * （backend/src/services/sync.service.js 的 getBundle）做的是同一件事，改这里就得改那里。
 *
 * 不带 `schemaVersion`：那个字段记的是导出时本地 SQLite 的 user_version，
 * 云端无从得知。读不到时按 0 处理，于是"备份比本地库还新"那道拦截不会误伤这条路。
 */
async function fetchCloudBundle(): Promise<BackupBundle> {
  const userId = await requireBookId();

  const [categories, icons, accounts, transactions, images, transfers, recurring] = await Promise.all([
    run(
      `SELECT "id", "name", "icon", "type", "parentId", "sortOrder", "isActive"
         FROM "Category" WHERE "userId" = $1 ORDER BY "sortOrder" ASC, "name" ASC`,
      [userId],
    ),
    run(
      `SELECT "name", "mimeType", encode("data", 'base64') AS "data"
         FROM "CategoryIcon" WHERE "userId" = $1 ORDER BY "createdAt" ASC`,
      [userId],
    ),
    run(
      `SELECT "id", "name", "type", "currency", "openingBalance", "icon", "createdAt"
         FROM "Account" WHERE "userId" = $1 ORDER BY "createdAt" ASC`,
      [userId],
    ),
    run(`SELECT * FROM "Transaction" WHERE "userId" = $1`, [userId]),
    run(
      `SELECT image."id", image."transactionId", image."url", image."createdAt"
         FROM "TransactionImage" image
         JOIN "Transaction" tx ON tx."id" = image."transactionId"
        WHERE tx."userId" = $1`,
      [userId],
    ),
    run(`SELECT * FROM "Transfer" WHERE "userId" = $1`, [userId]),
    run(`SELECT * FROM "RecurringTransaction" WHERE "userId" = $1`, [userId]),
  ]);

  return {
    format: 'corddaily-backup',
    formatVersion: 1,
    schemaVersion: 0,
    exportedAt: new Date().toISOString(),

    categories: categories.map((row) => ({
      id: row.id as string,
      name: row.name as string,
      icon: (row.icon ?? null) as string | null,
      type: row.type as 'INCOME' | 'EXPENSE',
      parentId: (row.parentId ?? null) as string | null,
      sortOrder: toNumber(row.sortOrder),
      isActive: row.isActive ? 1 : 0,
    })),

    categoryIcons: icons as unknown as CategoryIconBlob[],

    accounts: accounts.map((row) => ({
      id: row.id as string,
      name: row.name as string,
      type: row.type as string,
      currency: row.currency as string,
      openingBalance: toNumber(row.openingBalance),
      icon: (row.icon ?? null) as string | null,
      createdAt: toIso(row.createdAt) ?? new Date().toISOString(),
    })),

    transactions: transactions.map((row) => ({
      id: row.id as string,
      title: row.title as string,
      merchant: row.merchant ?? null,
      location: row.location ?? null,
      remarks: row.remarks ?? null,
      amount: toNumber(row.amount),
      currency: row.currency as string,
      exchangeRate: toNumber(row.exchangeRate),
      amountInBase: toNumber(row.amountInBase),
      type: row.type as string,
      date: toIso(row.date),
      // 本地那一列是 TEXT，存的就是一段 JSON；这里不能直接给数组
      tags: JSON.stringify(Array.isArray(row.tags) ? row.tags : []),
      isReimbursable: row.isReimbursable ? 1 : 0,
      reimbursedAt: toIso(row.reimbursedAt),
      excludeFromStats: row.excludeFromStats ? 1 : 0,
      categoryId: row.categoryId as string,
      accountId: row.accountId as string,
      recurringId: (row.recurringId ?? null) as string | null,
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
    })),

    transactionImages: images.map((row) => ({
      id: row.id as string,
      transactionId: row.transactionId as string,
      url: row.url as string,
      createdAt: toIso(row.createdAt),
    })),

    transfers: transfers.map((row) => ({
      id: row.id as string,
      amount: toNumber(row.amount),
      date: toIso(row.date),
      note: row.note ?? null,
      fromAccountId: row.fromAccountId as string,
      toAccountId: row.toAccountId as string,
      createdAt: toIso(row.createdAt),
    })),

    recurring: recurring.map((row) => ({
      id: row.id as string,
      title: row.title as string,
      remarks: row.remarks ?? null,
      amount: toNumber(row.amount),
      currency: row.currency as string,
      exchangeRate: toNumber(row.exchangeRate),
      type: row.type as string,
      frequency: row.frequency as string,
      startDate: toIso(row.startDate),
      nextRunDate: toIso(row.nextRunDate),
      endDate: toIso(row.endDate),
      isActive: row.isActive ? 1 : 0,
      categoryId: row.categoryId as string,
      accountId: row.accountId as string,
      createdAt: toIso(row.createdAt),
    })),

    // 月预算只存在手机本地的 app_settings 里，云端没有。字段留着并显式给 null，
    // 是为了让这份包跟文件备份**结构完全一致**
    settings: { overallMonthlyBudget: null },
  } as BackupBundle;
}

export const transport: CloudTransport = {
  fetchCloudSummary,
  fetchCloudBundle,
  fetchCloudCategories,
  fetchCloudAccounts,
  fetchCloudIconNames,
  fetchCategoryIconBlobs,
  pushCategoryIcons,
  pushAvatar,
  fetchAvatar,
  pushCategories,
  pushAccounts,
  pushTransactions,
  pushTransfers,
  pushRecurring,
  deleteRemote,
  finishPush: stampPush,
};
