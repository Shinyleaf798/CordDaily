import * as Crypto from 'expo-crypto';

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
  openingBalance: number;
  icon: string | null;
  createdAt: string;
  synced: number;
};

// 排序里带上 id 只是为了**确定性**：两个账户的 createdAt 撞到同一毫秒时（灌默认账户之后立刻手动建一个），
// 光按 createdAt 排，SQLite 给的先后可以是任意的，列表每次刷新顺序都可能变。
// 带 alias 参数是因为 listAccountBalances 要 JOIN，列名必须写成 a.createdAt。
// 做成函数而不是两个常量：排序规则只有一处定义，改了不会漏掉其中一边
const accountsOrder = (alias = '') => `ORDER BY ${alias}createdAt ASC, ${alias}id ASC`;

export async function listAccounts(): Promise<Account[]> {
  const db = await getDb();
  return db.getAllAsync<Account>(`SELECT * FROM accounts ${accountsOrder()}`);
}

// 「不选择任何账户」那一行的 id 记在本地设置里，不在 accounts 表上加 isDefault 列。
//
// 为什么不写死一个固定 id（那样迁移老用户只要一条纯 SQL）：account.id 是**全局**主键，
// 所有用户的数据最终会进同一张服务器表，写死的话两个用户一同步就撞 id。
// 记在 app_settings 里则天然是本机的事——这张表本来就不进服务器（见 budgets.ts 的说明）。
const NO_ACCOUNT_KEY = 'noAccountId';

async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>('SELECT "value" FROM app_settings WHERE "key" = ?', [key]);
  return row?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO app_settings ("key", "value") VALUES (?, ?)', [key, value]);
}

/** 「不选择任何账户」那一行的 id。还没灌过（老库第一次启动到这个版本之前）时是 null。
 *  只在本文件内部用：getDefaultAccountId 和 seedDefaultAccounts */
async function getNoAccountId(): Promise<string | null> {
  const id = await getSetting(NO_ACCOUNT_KEY);
  if (!id) return null;

  // 设置里记着 id、行却不在了：理论上不会发生（它删不掉），但真发生时得当作"还没有"，
  // 否则下面所有拿它当兜底的逻辑都会指向一个空行
  const db = await getDb();
  const row = await db.getFirstAsync<{ id: string }>('SELECT id FROM accounts WHERE id = ?', [id]);
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
  const row = await db.getFirstAsync<{ id: string }>(`SELECT id FROM accounts ${accountsOrder()} LIMIT 1`);
  return row?.id ?? null;
}

/**
 * 上一次记账用的是哪个账户。记账页拿它当默认值。
 *
 * 不另存一个"上次选择"的设置，直接从最后一条**记录**（createdAt 最新，不是交易日期最新）反查：
 * 那本来就是"上一次的选择"，不会跟真实情况走散，也不用在保存成功后再写一次库。
 * 跟 getLastCategoryForMerchant（记住上次在这家店选的分类）是同一个路子。
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
 * 把它改指到默认账户会变成"自己转给自己"，还会悄悄改掉余额。
 * （目前还没有任何地方能创建转账，这张表一直是空的，这段是为以后接上转账功能时不留坑。）
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
};

export async function createAccount(input: CreateAccountInput): Promise<Account> {
  const db = await getDb();
  const account: Account = {
    id: Crypto.randomUUID(),
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
 * 为什么还是灌了「现金」：想分账户的人开箱就有一个真账户可用，不用先去资产页建一个。
 * 两个之间选哪个由"上次用的是哪个"决定（见 getLastUsedAccountId），所以只要选一次就定了。
 *
 * 两条的 seed 时机不一样，是故意的：
 * - 「不选择任何账户」看的是它**自己在不在**，老用户升级上来也会补，而且它删不掉
 * - 「现金」只在**全新安装**时灌一次。老用户可能已经把它删了，不该每次启动又长回来
 *   （分类那边踩过同样的问题，解法一样，见 categories.ts 的 seed 标记）
 *
 * id 要 UUID（核心原则#2），SQL 迁移里生成不了，所以放在代码里而不是写成 migration。
 */
export async function seedDefaultAccounts(): Promise<void> {
  const db = await getDb();

  // 先数一次：下面创建「不选择任何账户」之后表就不空了，再判断"是不是全新安装"就晚了
  const existing = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM accounts');
  const isFreshInstall = (existing?.count ?? 0) === 0;

  if (!(await getNoAccountId())) {
    const account = await createAccount({ name: '不选择任何账户' });
    await setSetting(NO_ACCOUNT_KEY, account.id);
  }

  // openingBalance 给 0：一上来就逼用户盘点钱包里有多少现金，是在记账之前先设一道门槛。
  // 余额本来就是衍生值，想要准的人随时可以回资产页把期初改对
  if (isFreshInstall) await createAccount({ name: '现金' });
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

export type AccountWithBalance = Account & { balance: number };

/**
 * 一次把所有账户的余额都算出来。
 *
 * 资产页要的是每个账户的余额 + 每个分组的小计 + 全局的总资产/总负债，
 * 逐个账户调 getAccountBalance 的话是 N×4 条查询（那个函数内部有四条子查询），
 * 而且每一行自己发请求，小计还得等所有行都回来才能算。这里改成一条：
 * 三个 GROUP BY 子查询各自汇总一遍，再 LEFT JOIN 回账户表。
 *
 * 算法跟 getAccountBalance **必须**保持一致（也跟后端 account.service.js 一致）：
 * openingBalance + 收入 - 支出 + 转入 - 转出。两处口径一旦分叉，
 * 就会出现"这一行显示 100、小计里却按 90 算"这种没人查得出来的 bug。
 *
 * 跟统计口径不同，这里**不**跳过 excludeFromStats：那笔钱是真的离开了账户，
 * "不计入统计"说的是它不该占用预算额度，不是它没发生过。
 */
export async function listAccountBalances(): Promise<AccountWithBalance[]> {
  const db = await getDb();
  return db.getAllAsync<AccountWithBalance>(
    `SELECT a.*,
            a.openingBalance
              + COALESCE(t.income, 0)   - COALESCE(t.expense, 0)
              + COALESCE(ti.total, 0)   - COALESCE(to_.total, 0) AS balance
     FROM accounts a
     LEFT JOIN (
       SELECT accountId,
              SUM(CASE WHEN type = 'INCOME'  THEN amountInBase ELSE 0 END) AS income,
              SUM(CASE WHEN type = 'EXPENSE' THEN amountInBase ELSE 0 END) AS expense
       FROM transactions GROUP BY accountId
     ) t ON t.accountId = a.id
     LEFT JOIN (SELECT toAccountId   AS id, SUM(amount) AS total FROM transfers GROUP BY toAccountId)   ti  ON ti.id  = a.id
     LEFT JOIN (SELECT fromAccountId AS id, SUM(amount) AS total FROM transfers GROUP BY fromAccountId) to_ ON to_.id = a.id
     ${accountsOrder('a.')}`,
  );
}

/**
 * 单个账户的余额。**界面上已经没有调用方**——资产页统一走 listAccountBalances 一次算完。
 *
 * 留着是因为它是那条批量查询的**参照实现**：一个账户一个账户地算，四条子查询各管一件事，
 * 读起来就是「余额 = 期初 + 收 - 支 + 转入 - 转出」这句话本身，
 * 而 listAccountBalances 那条 JOIN 为了一次算完所有账户，把同一件事写成了三个 GROUP BY 子查询。
 * 两边必须给出同样的结果（写 listAccountBalances 时就是拿这个函数对跑验证的），
 * 以后改余额口径，改完也该拿这两个再对一次。
 *
 * 算法跟后端 account.service.js 保持一致。
 */
export async function getAccountBalance(accountId: string): Promise<number> {
  const db = await getDb();
  const account = await db.getFirstAsync<{ openingBalance: number }>(
    'SELECT openingBalance FROM accounts WHERE id = ?',
    [accountId],
  );
  if (!account) return 0;

  const [income, expense, transfersIn, transfersOut] = await Promise.all([
    db.getFirstAsync<{ total: number | null }>(
      `SELECT SUM(amountInBase) as total FROM transactions WHERE accountId = ? AND type = 'INCOME'`,
      [accountId],
    ),
    db.getFirstAsync<{ total: number | null }>(
      `SELECT SUM(amountInBase) as total FROM transactions WHERE accountId = ? AND type = 'EXPENSE'`,
      [accountId],
    ),
    db.getFirstAsync<{ total: number | null }>('SELECT SUM(amount) as total FROM transfers WHERE toAccountId = ?', [
      accountId,
    ]),
    db.getFirstAsync<{ total: number | null }>('SELECT SUM(amount) as total FROM transfers WHERE fromAccountId = ?', [
      accountId,
    ]),
  ]);

  return (
    account.openingBalance +
    (income?.total ?? 0) -
    (expense?.total ?? 0) +
    (transfersIn?.total ?? 0) -
    (transfersOut?.total ?? 0)
  );
}
