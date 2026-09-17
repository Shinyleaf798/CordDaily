import * as Crypto from 'expo-crypto';

import { getDb } from './client';

export type AccountType = 'CASH' | 'BANK' | 'EWALLET' | 'CREDIT_CARD' | 'OTHER';

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  openingBalance: number;
  icon: string | null;
  createdAt: string;
  synced: number;
};

export async function listAccounts(): Promise<Account[]> {
  const db = await getDb();
  return db.getAllAsync<Account>('SELECT * FROM accounts ORDER BY createdAt ASC');
}

// id 在本地创建的这一刻就生成好（CLAUDE.md 核心原则#2），不等服务器返回
export async function createAccount(input: {
  name: string;
  type: AccountType;
  currency?: string;
  openingBalance?: number;
  icon?: string | null;
}): Promise<Account> {
  const db = await getDb();
  const account: Account = {
    id: Crypto.randomUUID(),
    name: input.name,
    type: input.type,
    currency: input.currency ?? 'MYR',
    openingBalance: input.openingBalance ?? 0,
    icon: input.icon ?? null,
    createdAt: new Date().toISOString(),
    synced: 0,
  };

  await db.runAsync(
    `INSERT INTO accounts (id, name, type, currency, openingBalance, icon, createdAt, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [account.id, account.name, account.type, account.currency, account.openingBalance, account.icon, account.createdAt, account.synced],
  );

  return account;
}

/**
 * 首次启动灌一个默认账户。
 *
 * 为什么必须有：`transactions.accountId` 是 NOT NULL，没有账户就一笔账都记不了——
 * 全新安装的 App 打开后保存按钮永远是灰的，而界面根本没地方解释为什么。
 * 这个空档之前一直存在，只是记账页默认取 `accounts[0]` 把它盖住了。
 *
 * 为什么只灌一个、不灌「现金 / 银行卡 / 电子钱包」三个：灌三个就等于每笔账都要**做一次选择**，
 * 而账户对不关心它的人应该是完全隐形的。一个默认值一直在，chip 上写着「现金」，永远不用点开；
 * 真的要分账户的人自己去资产页加，那时候他清楚自己要什么。
 *
 * 为什么不把 accountId 改成可空：那要改本地表、Prisma schema、后端校验和每一条聚合查询，
 * 换来的是一个"没有账户的交易"的新状态，所有统计都得想清楚怎么对待它。灌一行数据便宜得多。
 *
 * 跟 seedDefaultCategories 一样只在空库时跑：id 要 UUID（核心原则#2），SQL 迁移里生成不了，
 * 所以放在代码里而不是写成一条 migration。
 */
export async function seedDefaultAccount(): Promise<void> {
  const db = await getDb();
  const existing = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM accounts');
  if ((existing?.count ?? 0) > 0) return;

  // openingBalance 给 0：一上来就逼用户盘点钱包里有多少现金，是在记账之前先设一道门槛。
  // 余额本来就是衍生值，想要准的人随时可以回资产页把期初改对
  await createAccount({ name: '现金', type: 'CASH' });
}

// 余额是衍生值，本地也不存字段，跟后端 account.service.js 的算法保持一致：
// openingBalance + 收支净额 + 转入 - 转出
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
