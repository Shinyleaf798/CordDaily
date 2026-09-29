import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { BOOTSTRAP_SQL, REMOTE_MIGRATIONS, REMOTE_SCHEMA_VERSION, REQUIRED_COLUMNS } from './schema';

/**
 * 用户自己那个 Neon 库的连接、建表和身份。
 *
 * **连接串就是凭证**，没有注册也没有登录。用户在 Neon 控制台建 project 拿到的那一条
 * `postgresql://...` 既是地址也是密码，能拿到它的人对这个库有完全权限（包括 DDL——
 * 自动建表正是靠这个）。所以这里不再存密码：同一个库里的密码哈希保护不了任何东西。
 *
 * 它存在 **SecureStore**，不是 app_settings 那张 SQLite 表：那张表会被导出进备份包，
 * 而备份文件是用户会往聊天窗口和网盘里丢的东西。一条带 DDL 权限的活凭证不能跟着它走。
 *
 * 驱动用 `@neondatabase/serverless` 的 **HTTP 模式**（`neon()`）：React Native 里没有
 * TCP socket，`pg` 那套直连用不了；HTTP 这条走 fetch，一次请求一条（或一个事务），
 * 正好对上"偶尔备份一次"这种用法，不需要连接池。
 */

const CONNECTION_KEY = 'neonConnectionString';

/** 自动建表时往 `User` 里写的那一行的占位值。它不是账号，只是外键的落脚点 */
const PLACEHOLDER_EMAIL = 'owner@corddaily.local';
const PLACEHOLDER_PASSWORD_HASH = 'no-auth:byo-neon';

type Sql = NeonQueryFunction<false, false>;

// 连接串和 sql 实例都缓存着：一次备份要发几十个请求，每次都去 SecureStore 读一遍
// 再重建一个 neon() 是白费的。断开连接时两个一起清（见 disconnectRemote）
let cachedConnectionString: string | null | undefined;
let cachedSql: Sql | null = null;
let cachedBookId: string | null = null;

// ---- 连接串的存取 ----

export async function getConnectionString(): Promise<string | null> {
  if (cachedConnectionString !== undefined) return cachedConnectionString;
  cachedConnectionString = await SecureStore.getItemAsync(CONNECTION_KEY);
  return cachedConnectionString;
}

/** 配没配过云端。「我的」页那张备份卡拿它决定按钮是「备份」还是「去连接」 */
export async function hasRemote(): Promise<boolean> {
  return !!(await getConnectionString());
}

async function saveConnectionString(value: string): Promise<void> {
  await SecureStore.setItemAsync(CONNECTION_KEY, value);
  cachedConnectionString = value;
  cachedSql = null;
  cachedBookId = null;
}

/**
 * 断开。**只清手机上的凭证，一个字节的云端数据都不动。**
 *
 * 「断开」和「删掉云端的账」是两件事，不该由同一个按钮做——前者是随时可以反悔的
 * （把连接串再粘一次就回来了），后者不可逆。要删库请去 Neon 控制台，那里有真正的确认流程。
 */
export async function disconnectRemote(): Promise<void> {
  await SecureStore.deleteItemAsync(CONNECTION_KEY);
  cachedConnectionString = null;
  cachedSql = null;
  cachedBookId = null;
}

/**
 * 把连接串收拾干净再用。
 *
 * 用户是从 Neon 控制台**复制**过来的，粘进输入框时常常带着换行、首尾空格，
 * 有时还带上前面那个 `psql ` 或者外层的单引号——那些都不是他打错了，是复制按钮给的东西。
 * 与其弹一句「格式不对」让人自己找，不如把这几种已知的包装拆掉。
 */
export function normalizeConnectionString(raw: string): string {
  let value = raw.trim().replace(/\s+/g, '');
  if (value.startsWith('psql')) value = value.slice(4);
  value = value.replace(/^['"]|['"]$/g, '');
  return value;
}

export type ConnectionProblem = { message: string };

/**
 * 粘进来的东西能不能用。**只做本地检查**，不发请求——用户还在打字的时候不该去连网。
 *
 * 不是 Neon 的主机**只警告不拦**：任何 Postgres 都能装下这套表，而 `neon()` 这个驱动
 * 只认 Neon 的 HTTP 端点，真连的时候会自己失败。在这里一刀切拦掉，等于替用户决定
 * 他不能用自建的库——但那句警告要说出来，否则失败信息会很难懂。
 */
export function checkConnectionString(raw: string): ConnectionProblem | null {
  const value = normalizeConnectionString(raw);
  if (!value) return { message: '还没粘连接串' };
  if (!/^postgres(ql)?:\/\//.test(value)) {
    return { message: '连接串要以 postgresql:// 开头，从 Neon 控制台的 Connection string 复制整条' };
  }
  try {
    const url = new URL(value);
    if (!url.hostname) return { message: '连接串里没有主机名，可能复制得不完整' };
    if (!url.password) return { message: '连接串里没有密码，Neon 控制台上要先点一下「Show password」再复制' };
  } catch {
    return { message: '这条连接串解析不了，确认复制的是完整的一整条' };
  }
  return null;
}

/**
 * 当前云端目标的一个身份标记，**不发请求**。
 *
 * 给「重装后问一次要不要恢复」那个弹窗用（components/settings/restore-prompt.tsx）：
 * 它要记住"这个云端我已经跳过了"，而换一个云端时应该重新问一次。
 * 登录那条路用 userId 回答这件事，这条路没有 userId 可用。
 *
 * 用主机名而不是 `app_meta.bookId`：bookId 更准，但取它要连一次网，
 * 而这个判断跑在**每次启动**上。跳过标记记错的代价只是多问一次，
 * 为它在冷启动路径上加一个网络请求不划算。
 */
export async function getRemoteIdentity(): Promise<string | null> {
  const connectionString = await getConnectionString();
  return connectionString ? `neon:${describeHost(connectionString)}` : null;
}

/** 给界面显示用的主机名，不带用户名密码。「已连接到 ep-xxx.ap-southeast-1.aws.neon.tech」 */
export function describeHost(raw: string): string {
  try {
    return new URL(normalizeConnectionString(raw)).hostname;
  } catch {
    return '未知主机';
  }
}

// ---- 连上去 ----

async function getSql(): Promise<Sql> {
  if (cachedSql) return cachedSql;
  const connectionString = await getConnectionString();
  if (!connectionString) throw new Error('还没连接云端数据库');
  cachedSql = neon(connectionString);
  return cachedSql;
}

/** 已经连好的库。传输层每个函数开头都调它 */
export async function requireSql(): Promise<Sql> {
  return getSql();
}

export type RemoteStatus = {
  host: string;
  bookId: string;
  /** 库里的表结构版本。跟 REMOTE_SCHEMA_VERSION 一致才算就绪 */
  schemaVersion: number;
  transactions: number;
  categories: number;
  accounts: number;
  lastPushAt: string | null;
};

/**
 * 连接（或重连）一个库：建表 → 补迁移 → 确认账本身份 → 存凭证。
 *
 * **四种情况走的是同一条路**，因为每一步都是幂等的：全新的空库、另一台手机已经建好的库、
 * 以前用后端注册过的库、App 升级后表结构落后一版的库。分成「初始化」和「连接」两个按钮的话，
 * 用户得先自己判断属于哪一种——而他判断不了。
 *
 * 凭证**最后才存**：中途任何一步失败，手机上就不会留下一条连不上的连接串，
 * 「我的」页那张卡也不会变成"已连接"却每次备份都报错的样子。
 */
export async function connectRemote(raw: string): Promise<RemoteStatus> {
  const connectionString = normalizeConnectionString(raw);
  const problem = checkConnectionString(connectionString);
  if (problem) throw new Error(problem.message);

  const sql = neon(connectionString);

  // 先探一下再建表：连不上、密码错、库不存在，全都在这一句上暴露，
  // 而这时候还没有往人家库里写过任何东西
  try {
    await sql.query('SELECT 1');
  } catch (error) {
    throw new Error(describeNeonError(error));
  }

  await sql.query(BOOTSTRAP_SQL);
  await sql.query('INSERT INTO "app_meta" ("id", "schemaVersion") VALUES (1, 0) ON CONFLICT ("id") DO NOTHING');

  const version = await migrateRemote(sql);
  await verifySchema(sql);
  const bookId = await ensureBook(sql);

  await saveConnectionString(connectionString);
  cachedBookId = bookId;

  return { ...(await readRemoteStatus(sql, bookId)), host: describeHost(connectionString), schemaVersion: version };
}

/**
 * 补跑迁移，返回跑完之后的版本号。
 *
 * **每一组和它的版本号写在同一个事务里**，一组一提交。本地那份（db/client.ts）是整个循环
 * 跑完才写一次版本号、而且写在事务外面——在 SQLite 上这个缝隙几乎撞不到，
 * 在这里却是常态：手机网络断在两组迁移中间，第一组已经提交而版本号还停在旧值，
 * 下次连接会把第一组重跑一遍，`ALTER TABLE ADD COLUMN` 不幂等，于是永远卡在那儿。
 *
 * 库比 App 新的时候**直接报错，不做任何事**：那些表里可能有这台手机还不认识的列，
 * 往里写等于用旧结构覆盖新数据。让用户去更新 App，比留下一个"能用但在悄悄丢字段"的状态好。
 */
async function migrateRemote(sql: Sql): Promise<number> {
  const rows = await sql.query('SELECT "schemaVersion" FROM "app_meta" WHERE "id" = 1');
  const current = Number(rows[0]?.schemaVersion ?? 0);

  if (current > REMOTE_SCHEMA_VERSION) {
    throw new Error(
      `云端的表结构是第 ${current} 版，这台手机上的 App 只认到第 ${REMOTE_SCHEMA_VERSION} 版。先更新 App 再连。`,
    );
  }
  if (current === REMOTE_SCHEMA_VERSION) return current;

  for (let version = current; version < REMOTE_SCHEMA_VERSION; version++) {
    const statements = REMOTE_MIGRATIONS[version];
    try {
      await sql.transaction((txn) => [
        ...statements.map((statement) => txn.query(statement)),
        txn.query('UPDATE "app_meta" SET "schemaVersion" = $1 WHERE "id" = 1', [version + 1]),
      ]);
    } catch (error) {
      throw new Error(`建表失败（第 ${version + 1} 版）：${describeNeonError(error)}`);
    }
  }
  return REMOTE_SCHEMA_VERSION;
}

/**
 * 建完表之后核对一遍：备份真正要用的列，库里是不是都有。
 *
 * **这一步只为一种库存在**——表已经在、但结构跟这份 DDL 对不上的那种。
 * `CREATE TABLE IF NOT EXISTS` 对它一个字都不改也不报错（见 schema.ts 的 REQUIRED_COLUMNS），
 * 所以没有这一步的话，它会连得好好的，直到第一次推账单才炸在一句
 * `column "merchant" ... does not exist` 上——那时候用户已经以为备份配好了。
 *
 * 最典型的来源是**以前用 prisma migrate 建过、之后 schema 又往前走过的库**。
 *
 * 一句 information_schema 查全部八张表，不是一张一张问：连接这一步已经有好几个来回了，
 * 再加八个不值得。报错里把缺的列名全列出来——只说"结构对不上"等于让人自己去猜是哪一列。
 */
async function verifySchema(sql: Sql): Promise<void> {
  const tables = Object.keys(REQUIRED_COLUMNS);
  const rows = await sql.query(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ANY($1)`,
    [tables],
  );

  const present = new Map<string, Set<string>>();
  for (const row of rows) {
    const table = row.table_name as string;
    if (!present.has(table)) present.set(table, new Set());
    present.get(table)!.add(row.column_name as string);
  }

  const problems: string[] = [];
  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    const actual = present.get(table);
    if (!actual) {
      problems.push(`${table}（整张表都不在）`);
      continue;
    }
    const missing = columns.filter((column) => !actual.has(column));
    if (missing.length) problems.push(`${table} 少了 ${missing.join('、')}`);
  }

  if (problems.length) {
    throw new Error(
      `这个库里的表跟 App 要的对不上：${problems.join('；')}。` +
        `它多半是以前用后端的 prisma migrate 建的，而那之后表结构改过。` +
        `最省事的办法是在 Neon 控制台新建一个空的 database 再连过来，然后用备份文件把账恢复进去。`,
    );
  }
}

/**
 * 这个库的账本 id，也就是所有业务表 `userId` 那一列要填的值。
 *
 * **换手机时从库里读出来，不重新生成**——这正是"第二台手机认得出第一台的账"的全部机制。
 * 生成一个新的话，两台手机的数据会在同一个库里各自成一摊，而且因为内置分类的 id 是写死的
 * （每个 userId 下都有同一批），新的那摊还会把分类整个复制一遍。
 *
 * 库里已经有 `User` 行（以前用后端注册过、或者另一台手机建的）就认那一行；
 * 一行都没有才生成新的。多于一行时取最早的那个：那是这个库的主人。
 */
async function ensureBook(sql: Sql): Promise<string> {
  const meta = await sql.query('SELECT "bookId" FROM "app_meta" WHERE "id" = 1');
  const recorded = meta[0]?.bookId as string | null | undefined;
  if (recorded) return recorded;

  const existing = await sql.query('SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1');
  let bookId = existing[0]?.id as string | undefined;

  if (!bookId) {
    bookId = Crypto.randomUUID();
    await sql.query(
      'INSERT INTO "User" ("id", "email", "passwordHash") VALUES ($1, $2, $3) ON CONFLICT ("id") DO NOTHING',
      [bookId, PLACEHOLDER_EMAIL, PLACEHOLDER_PASSWORD_HASH],
    );
  }

  await sql.query('UPDATE "app_meta" SET "bookId" = $1 WHERE "id" = 1', [bookId]);
  return bookId;
}

/** 当前账本 id。传输层每条 SQL 的 userId 都取它 */
export async function requireBookId(): Promise<string> {
  if (cachedBookId) return cachedBookId;
  const sql = await getSql();
  const rows = await sql.query('SELECT "bookId" FROM "app_meta" WHERE "id" = 1');
  const bookId = rows[0]?.bookId as string | undefined;
  if (!bookId) throw new Error('云端还没初始化，去「云端备份」里重新连一次');
  cachedBookId = bookId;
  return bookId;
}

/** 备份成功之后盖一个时间戳，纯粹是为了在别的设备上也看得到「上次是什么时候推的」 */
export async function stampPush(): Promise<void> {
  const sql = await getSql();
  await sql.query('UPDATE "app_meta" SET "lastPushAt" = now() WHERE "id" = 1');
}

async function readRemoteStatus(sql: Sql, bookId: string): Promise<RemoteStatus> {
  const [counts] = await sql.query(
    `SELECT
       (SELECT COUNT(*) FROM "Transaction" WHERE "userId" = $1) AS transactions,
       (SELECT COUNT(*) FROM "Category"    WHERE "userId" = $1) AS categories,
       (SELECT COUNT(*) FROM "Account"     WHERE "userId" = $1) AS accounts,
       (SELECT "lastPushAt" FROM "app_meta" WHERE "id" = 1)     AS "lastPushAt"`,
    [bookId],
  );

  return {
    host: '',
    bookId,
    schemaVersion: REMOTE_SCHEMA_VERSION,
    transactions: Number(counts?.transactions ?? 0),
    categories: Number(counts?.categories ?? 0),
    accounts: Number(counts?.accounts ?? 0),
    lastPushAt: counts?.lastPushAt ? new Date(counts.lastPushAt as string).toISOString() : null,
  };
}

/** 「云端备份」页上那张状态卡。没连过就是 null，不报错——没连不是错误 */
export async function fetchRemoteStatus(): Promise<RemoteStatus | null> {
  const connectionString = await getConnectionString();
  if (!connectionString) return null;
  const sql = await getSql();
  const bookId = await requireBookId();
  return { ...(await readRemoteStatus(sql, bookId)), host: describeHost(connectionString) };
}

/**
 * 把驱动那一坨错误压成一句人话。它会原样显示在连接页上，所以要说清楚**下一步该做什么**。
 *
 * 密码错和主机不存在是两种完全不同的处置（改密码 vs 改地址），但驱动给的原始消息
 * 常常只是一句 `fetch failed`。能认出来的就说具体的，认不出来的原样带上——
 * 一句笼统的「连接失败」等于把用户唯一的线索拿走。
 */
export function describeNeonError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const lower = raw.toLowerCase();

  if (lower.includes('password authentication failed')) {
    return '密码不对。去 Neon 控制台重新复制一条连接串（记得先点「Show password」）';
  }
  if (lower.includes('does not exist') && lower.includes('database')) {
    return '这个库不存在。检查连接串最后那个库名（Neon 新建的通常叫 neondb）';
  }
  if (lower.includes('fetch failed') || lower.includes('network request failed')) {
    return '连不上。检查手机网络，以及这条连接串是不是 Neon 的（这个驱动只认 Neon 的地址）';
  }
  if (lower.includes('permission denied') || lower.includes('must be owner')) {
    return '这个角色没有建表权限。用 Neon 控制台上默认那个 owner 角色的连接串';
  }
  return raw;
}
