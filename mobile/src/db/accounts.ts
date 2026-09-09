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
