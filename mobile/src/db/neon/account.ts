import bcrypt from 'bcryptjs';
import * as Crypto from 'expo-crypto';

import { describeHost, describeNeonError, getConnectionString, requireSql } from './client';
import { clearCloudSession, saveCloudSession, type CloudSession } from './session';

/**
 * 云端账号：注册 / 登录 / 认领，全部直接对着用户自己那个 Neon 库跑 SQL。
 *
 * ## 为什么账号建在用户的库里，而不是我的后端
 *
 * 备份这条路已经绕开我的服务器了（手机直连 Neon）。如果登录还要走我的 Render 实例，
 * 那就变成"备份自己的数据库，得先指望别人的服务器活着"——一个可以随时消失的单点，
 * 卡在一条本来完全自给自足的链路中间。所以密码哈希写进**用户自己库里**那张 `User` 表，
 * 手机自己算 bcrypt，自己比对。我这边一无所知。
 *
 * ## 这道门到底挡什么
 *
 * 老实说：**它挡不住拿到连接串的人。** 连接串带 DDL 权限，谁拿到它都能直接读表，
 * 库里的密码哈希拦不住。所以这不是第二道安全锁，它买的是另外两样东西：
 *
 * - **一个库能放几本账**。夫妻俩、或者个人账和店里的账，共用一个免费 Neon project，
 *   各自一个账号各自一个 `userId`，互相看不见。以前是一个库一本账。
 * - **换手机时确认身份**。原来连上就自动认领库里的第一本账；现在要输一次密码，
 *   粘错成别人的串时不会直接把人家的账拉下来。
 *
 * ## bcrypt 而不是随便一个哈希
 *
 * 格式跟 backend/src/services/auth.service.js 完全一致（`$2b$`，cost 10），
 * 所以同一个库既能被手机登，也能被那套 Express + Prisma 后端登。以后网页端只读那条路
 * 接上来的时候，不用再迁移一次密码。
 */

// bcryptjs 生成盐要随机数。它优先找全局 `crypto.getRandomValues`，而 React Native 里
// 这个东西不保证存在（Hermes 不带，Expo 也不默认塞）。与其赌运气，直接把 expo-crypto 的
// 系统级随机数接上去——盐不随机的 bcrypt 等于没加盐。
bcrypt.setRandomFallback((length) => Array.from(Crypto.getRandomBytes(length)));

/** 跟后端 SALT_ROUNDS 保持一致，不然两边算出来的哈希强度不同 */
const COST = 10;

const MIN_PASSWORD_LENGTH = 8;

/** 自动建表那一版往 `User` 里写的占位行。认出它是为了能把它「认领」成正式账号 */
const LEGACY_PASSWORD_HASH = 'no-auth:byo-neon';

export type AccountProbe = {
  /** 这个库里有几个账号（不含下面那个占位行） */
  total: number;
  /**
   * 旧版自动建的那一行，没有密码。不是 null 就说明这个库是上一版 App 连过的，
   * 页面该引导用户「给这本账设个密码」而不是「注册一个新账号」——
   * 后者会开出第二本空账，而原来那些账单还挂在占位行的 id 下面，看着像丢了。
   */
  legacyId: string | null;
  /** 占位行名下有多少笔账单。给认领那一屏一个具体数字，让用户知道自己在保住什么 */
  legacyTransactions: number;
};

/** 这个库现在是什么局面：空的（去注册）、有占位行（去认领）、有正式账号（去登录） */
export async function probeAccounts(): Promise<AccountProbe> {
  const sql = await requireSql();
  const rows = await run(sql, 'SELECT "id", "passwordHash" FROM "User" ORDER BY "createdAt" ASC');

  const legacy = rows.find((row) => row.passwordHash === LEGACY_PASSWORD_HASH);
  const legacyId = (legacy?.id as string | undefined) ?? null;

  let legacyTransactions = 0;
  if (legacyId) {
    const [counts] = await run(sql, 'SELECT COUNT(*) AS total FROM "Transaction" WHERE "userId" = $1', [legacyId]);
    legacyTransactions = Number(counts?.total ?? 0);
  }

  return { total: rows.length - (legacyId ? 1 : 0), legacyId, legacyTransactions };
}

export async function registerCloudAccount(rawEmail: string, password: string, rawName?: string): Promise<CloudSession> {
  const email = normalizeEmail(rawEmail);
  checkCredentials(email, password);

  const sql = await requireSql();
  if (await emailTaken(sql, email)) {
    throw new Error('这个邮箱在这个库里已经注册过了，直接登录就行');
  }

  const id = Crypto.randomUUID();
  const name = rawName?.trim() || null;
  const passwordHash = await bcrypt.hash(password, COST);

  try {
    await sql.query('INSERT INTO "User" ("id", "email", "passwordHash", "name") VALUES ($1, $2, $3, $4)', [
      id,
      email,
      passwordHash,
      name,
    ]);
  } catch (error) {
    // 唯一键冲突：两台手机同时注册同一个邮箱。上面查过一次仍可能撞上，
    // 因为查和插之间没有锁——这里兜住，说的话跟上面那句一样
    if (isUniqueViolation(error)) throw new Error('这个邮箱在这个库里已经注册过了，直接登录就行');
    throw new Error(describeNeonError(error));
  }

  return openSession({ userId: id, email, name });
}

export async function loginCloudAccount(rawEmail: string, password: string): Promise<CloudSession> {
  const email = normalizeEmail(rawEmail);
  if (!email || !password) throw new Error('邮箱和密码都要填');

  const sql = await requireSql();
  const [row] = await run(sql, 'SELECT "id", "email", "name", "passwordHash" FROM "User" WHERE lower("email") = $1', [
    email,
  ]);

  // 找不到人和密码不对说的是同一句话。分开说等于白送一个"这个邮箱在不在这个库里"的
  // 探测接口——虽然拿着连接串的人本来就能直接查表，但没必要多开一个
  const hash = row?.passwordHash as string | undefined;
  if (!hash || hash === LEGACY_PASSWORD_HASH || !(await bcrypt.compare(password, hash))) {
    throw new Error('邮箱或密码不对');
  }

  return openSession({
    userId: row.id as string,
    email: (row.email as string) ?? email,
    name: (row.name as string | null) ?? null,
  });
}

/**
 * 把旧版自动建的那一行占位账号变成正式账号：**id 原地不动**，只补上邮箱和密码。
 *
 * id 不动是这个函数存在的全部理由。所有已经推上去的账单、分类、账户，`userId` 填的都是
 * 那个 id；新建一个账号再把数据搬过去，等于在别人的库里做一次跨表更新（还有 `Category`
 * 那个 `@@id([userId, id])` 复合主键要跟着改）。原地改两个字段，一条 UPDATE 就完了。
 */
export async function claimLegacyBook(rawEmail: string, password: string): Promise<CloudSession> {
  const email = normalizeEmail(rawEmail);
  checkCredentials(email, password);

  const sql = await requireSql();
  const probe = await probeAccounts();
  if (!probe.legacyId) throw new Error('这个库里没有待认领的旧账本，请直接登录或注册');
  if (await emailTaken(sql, email)) throw new Error('这个邮箱在这个库里已经注册过了，换一个');

  const passwordHash = await bcrypt.hash(password, COST);
  await run(sql, 'UPDATE "User" SET "email" = $1, "passwordHash" = $2 WHERE "id" = $3', [
    email,
    passwordHash,
    probe.legacyId,
  ]);

  return openSession({ userId: probe.legacyId, email, name: null });
}

/** 退出账号，但**不断开库**：连接串还在，换个账号登进去就能继续用 */
export async function signOutCloud(): Promise<void> {
  await clearCloudSession();
}

// ---- 内部 ----

async function openSession(partial: Omit<CloudSession, 'host'>): Promise<CloudSession> {
  const connectionString = await getConnectionString();
  const session: CloudSession = { ...partial, host: connectionString ? describeHost(connectionString) : '' };
  await saveCloudSession(session);
  return session;
}

/** 邮箱统一小写存、小写查。后端那边是原样存的，所以查的时候按 `lower()` 比，两边都认 */
function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function checkCredentials(email: string, password: string): void {
  if (!email.includes('@') || email.length < 3) throw new Error('邮箱填得不对');
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`密码至少 ${MIN_PASSWORD_LENGTH} 位`);
}

async function emailTaken(sql: Awaited<ReturnType<typeof requireSql>>, email: string): Promise<boolean> {
  const rows = await run(sql, 'SELECT 1 FROM "User" WHERE lower("email") = $1 LIMIT 1', [email]);
  return rows.length > 0;
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string })?.code === '23505';
}

/** 所有查询都从这里走，好让驱动那一坨错误在到达页面之前先变成人话 */
async function run(
  sql: Awaited<ReturnType<typeof requireSql>>,
  text: string,
  params: unknown[] = [],
): Promise<Record<string, unknown>[]> {
  try {
    return (await sql.query(text, params)) as Record<string, unknown>[];
  } catch (error) {
    throw new Error(describeNeonError(error));
  }
}
