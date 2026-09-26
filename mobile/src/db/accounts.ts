import * as Crypto from 'expo-crypto';

import { DEFAULT_ACCOUNTS } from '@/constants/default-categories';

import { getDb } from './client';

export type AccountType = 'CASH' | 'BANK' | 'EWALLET' | 'CREDIT_CARD' | 'OTHER';

export type Account = {
  id: string;
  name: string;
  /**
   * 遗留字段，现在恒为 'OTHER'。
   *
   * 账户一度有"类型"（现金/银行卡/电子钱包/信用卡/其他），后来发现这个维度对这个 App 没用：
   * 账户存在的唯一目的是给一笔账贴上"我用什么付的"，再给标签分一次类是空转。
   * 列没删是因为它 NOT NULL + 有 CHECK 约束，删它要整表重建，而留着一个恒定值的列不碍事。
   * 后端 Prisma 里这个字段也还在（那边的库已经有这一列，动它就得跑迁移）。
   */
  type: AccountType;
  currency: string;
  /**
   * 遗留字段，现在恒为 0，界面上既不显示也不给填。
   *
   * 它唯一的用途是给「账户当前余额」一个起点，而余额本身已经整条拆掉了：
   * 账户在这个 App 里只是「我用什么付的」这么一个标签，余额准不准无关紧要，
   * 所以也就不需要转账、不需要对账，资产页整页没有非它不可的内容（见 DECISIONS.md）。
   *
   * 列没删的理由跟上面的 type 一样：它 NOT NULL + 有默认值，删它要整表重建，
   * 而留着一个恒为 0 的列不碍事。后端 Prisma 和 account.service.js 里的余额计算也先留着——
   * 电脑端是只读的，以后真要做资产视图时那套算法还是对的。
   */
  openingBalance: number;
  icon: string | null;
  createdAt: string;
  synced: number;
};

// 排序里带上 id 只是为了**确定性**：两个账户的 createdAt 撞到同一毫秒时（灌默认账户之后立刻手动建一个），
// 光按 createdAt 排，SQLite 给的先后可以是任意的，列表每次刷新顺序都可能变。
//
// 原来这里是个接 alias 参数的函数，因为 listAccountBalances 要 JOIN、列名得写成 a.createdAt。
// 那条查询已经随余额一起删了，两个调用方都不带 alias，所以收回成一个常量。
const ACCOUNTS_ORDER = 'ORDER BY createdAt ASC, id ASC';

export async function listAccounts(): Promise<Account[]> {
  const db = await getDb();
  return db.getAllAsync<Account>(`SELECT * FROM accounts ${ACCOUNTS_ORDER}`);
}

/**
 * 「不选择任何账户」那一行的 id。这一行还没灌过时是 null。
 *
 * 以前这个 id 是随机生成、记在 `app_settings.noAccountId` 里的——那时不敢写死，
 * 理由是「account.id 是全局主键，两个用户一同步就撞」。服务器改成 `@@id([userId, id])`
 * 之后这个顾虑没有了，于是它跟内置分类一样变成了常量：**重装恢复时所有账单的
 * accountId 不用改写就能对上**。那个设置键连同两个本地 getSetting/setSetting 一起删了
 * （通用的读写在 db/settings.ts）。
 *
 * 仍然要查一次库而不是直接返回常量：行可能压根还没灌（首次启动、seed 之前）。
 * 不查的话，下面所有拿它当兜底的逻辑会指向一个不存在的行。
 */
async function getNoAccountId(): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ id: string }>('SELECT id FROM accounts WHERE id = ?', [
    DEFAULT_ACCOUNTS.noAccount.id,
  ]);
  return row?.id ?? null;
}

/**
 * 兜底账户 = 「不选择任何账户」。它删不掉，删别的账户时账单也转到它名下。
 *
 * 之前这里是"建得最早的那个"（也就是「现金」）。改掉是因为语义：
 * 删掉「招商银行」时把那些账单转成「现金」，等于替用户断言"这些钱是现金付的"——那是假的。
 * 转成「不选择任何账户」才是真话：这些账还在，只是不再归属于任何账户。
 *
 * 退回最早那个只是为了兜住"设置里还没有这一行"的老库，正常路径走不到。
 */
export async function getDefaultAccountId(): Promise<string | null> {
  const noAccountId = await getNoAccountId();
  if (noAccountId) return noAccountId;

  const db = await getDb();
  const row = await db.getFirstAsync<{ id: string }>(`SELECT id FROM accounts ${ACCOUNTS_ORDER} LIMIT 1`);
  return row?.id ?? null;
}

/**
 * 上一次记账用的是哪个账户。记账页拿它当默认值。
 *
 * 不另存一个"上次选择"的设置，直接从最后一条**记录**（createdAt 最新，不是交易日期最新）反查：
 * 那本来就是"上一次的选择"，不会跟真实情况走散，也不用在保存成功后再写一次库。
 * 跟补全建议顺带带回 categoryId（记住上次用这个主题/店名时选的分类，见 transactions.ts
 * 的 suggestFieldValues）是同一个路子。
 *
 * JOIN 一下 accounts 是保险：只取还存在的账户，免得返回一个已经被删掉的 id
 * （删除时账单会被转走，所以正常查不出悬空的，但这条查询的结果会被直接当成选中值）。
 */
export async function getLastUsedAccountId(): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ accountId: string }>(
    `SELECT t.accountId FROM transactions t
     JOIN accounts a ON a.id = t.accountId
     ORDER BY t.createdAt DESC LIMIT 1`,
  );
  return row?.accountId ?? null;
}

/** 这个账户下挂着多少笔账单。删除前问一句，好在确认框里说清楚会动到多少东西 */
export async function countAccountTransactions(accountId: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM transactions WHERE accountId = ?',
    [accountId],
  );
  return row?.count ?? 0;
}

/**
 * 删一个账户，它名下的账单**转到默认账户**，不跟着一起删。
 *
 * 默认账户本身删不掉，这是硬性的：`transactions.accountId` 是 NOT NULL，
 * 删到一个账户都不剩的话，记账页的保存按钮会永远是灰的，而界面上没有任何地方解释为什么
 * （seedDefaultAccounts 的注释里写过同一件事）。留着「不选择任何账户」当兜底，
 * 就不用把 accountId 改成可空，也就不用给所有统计查询想清楚"没有账户的交易"该怎么算。
 *
 * 为什么账单是转移而不是删除：用户删的是"招商银行"这个**分类容器**，不是"我上个月花的那三百块"。
 * 跟着删掉的话，月度支出会凭空少一截，而他完全不会把这件事跟刚才那次删除联系起来。
 *
 * 转账行是直接删掉的：一笔转账的两端都必须存在，一端没了就不是转账了，
 * 把它改指到默认账户会变成"自己转给自己"。
 * （transfers 表一直是空的——没有任何地方能创建转账，而且账户降级成纯标签之后也不会再做，
 *  见 DECISIONS.md。这段留着是因为表还在，万一以后又用上它不至于留个坑。）
 *
 * 整段包在一个事务里：中途失败不能留下"账单已经转走、账户还在"的半截状态。
 */
export async function deleteAccount(accountId: string): Promise<{ movedTransactions: number }> {
  const db = await getDb();

  const defaultAccountId = await getDefaultAccountId();
  if (!defaultAccountId) throw new Error('账户列表是空的');
  // 界面上那行本来就不给删除按钮，这里再拦一道：规则写在数据层才是真的删不掉
  if (accountId === defaultAccountId) throw new Error('「不选择任何账户」不能删除');

  const movedTransactions = await countAccountTransactions(accountId);
  const now = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    // synced 置 0：这些账单跟服务器上那份已经不一样了（换了账户），下次同步要重新推
    await db.runAsync('UPDATE transactions SET accountId = ?, updatedAt = ?, synced = 0 WHERE accountId = ?', [
      defaultAccountId,
      now,
      accountId,
    ]);
    await db.runAsync('DELETE FROM transfers WHERE fromAccountId = ? OR toAccountId = ?', [accountId, accountId]);
    await db.runAsync('DELETE FROM accounts WHERE id = ?', [accountId]);
  });

  return { movedTransactions };
}

// id 在本地创建的这一刻就生成好（CLAUDE.md 核心原则#2），不等服务器返回
export type CreateAccountInput = {
  name: string;
  currency?: string;
  openingBalance?: number;
  /** 只给两个内置账户用：它们的 id 是常量。用户手动建的账户一律现场生成 */
  id?: string;
};

export async function createAccount(input: CreateAccountInput): Promise<Account> {
  const db = await getDb();
  const account: Account = {
    id: input.id ?? Crypto.randomUUID(),
    name: input.name,
    type: 'OTHER',
    currency: input.currency ?? 'MYR',
    openingBalance: input.openingBalance ?? 0,
    icon: null,
    createdAt: new Date().toISOString(),
    synced: 0,
  };

  await db.runAsync(
    `INSERT INTO accounts (id, name, type, currency, openingBalance, icon, createdAt, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      account.id, account.name, account.type, account.currency,
      account.openingBalance, account.icon, account.createdAt, account.synced,
    ],
  );

  return account;
}

/**
 * 灌两个默认账户：「不选择任何账户」和「现金」。
 *
 * 为什么必须有账户：`transactions.accountId` 是 NOT NULL，没有账户就一笔账都记不了——
 * 全新安装的 App 打开后保存按钮永远是灰的，而界面根本没地方解释为什么。
 *
 * 为什么第一个叫「不选择任何账户」：不是所有人都想管资产。逼着每笔账挂到某个账户上，
 * 等于为一个他不关心的维度反复做选择。给他一个明说"我不分"的选项，这件事就消失了。
 * 它是一个普通的账户行，不是 null——所以 accountId 可以继续是 NOT NULL，
 * 本地表、Prisma schema、后端校验和每一条聚合查询全都不用动。
 *
 * 为什么还是灌了「现金」：想分账户的人开箱就有一个真账户可用，不用先去账户页建一个。
 * 两个之间选哪个由"上次用的是哪个"决定（见 getLastUsedAccountId），所以只要选一次就定了。
 *
 * 两条的 seed 时机不一样，是故意的：
 * - 「不选择任何账户」看的是它**自己在不在**，老用户升级上来也会补，而且它删不掉
 * - 「现金」只在**全新安装**时灌一次。老用户可能已经把它删了，不该每次启动又长回来
 *   （分类那边踩过同样的问题，解法一样，见 categories.ts 的 seed 标记）
 *
 * 两个 id 都取自 `DEFAULT_ACCOUNTS` 常量，跟内置分类同一个道理：每台设备一样，
 * 重装恢复时账单的 accountId 不用改写就能对上。
 */
export async function seedDefaultAccounts(): Promise<void> {
  const db = await getDb();

  // 先数一次：下面创建「不选择任何账户」之后表就不空了，再判断"是不是全新安装"就晚了
  const existing = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM accounts');
  const isFreshInstall = (existing?.count ?? 0) === 0;

  if (!(await getNoAccountId())) await createAccount(DEFAULT_ACCOUNTS.noAccount);

  // openingBalance 走默认值 0：这个字段已经没有界面了（见类型定义上的说明）
  if (isFreshInstall) await createAccount(DEFAULT_ACCOUNTS.cash);
}

/**
 * 改一个已有账户。`id` 和 `createdAt` 不动（id 是同步幂等的依据，createdAt 是它被建出来的时刻）。
 * `synced` 一律置 0：这行跟服务器上那份已经不一样了，下次同步要重新推。
 */
export type UpdateAccountInput = CreateAccountInput & { id: string };

export async function updateAccount(input: UpdateAccountInput): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    // currency 和 type 不在更新之列：界面上它们是只读/固定的，
    // 跟着 input 写的话，没传这两个字段的调用方会把它们默默重置掉
    `UPDATE accounts SET name = ?, openingBalance = ?, synced = 0 WHERE id = ?`,
    [input.name, input.openingBalance ?? 0, input.id],
  );
}
