// 本地 SQLite 是唯一的数据录入入口（CLAUDE.md 核心原则#1），这里的表基本对应后端 Prisma schema，
// 但去掉了 userId（本地只服务当前登录的这一个人，不需要按用户过滤），
// 并给需要同步的表加了 synced 字段：本地新建/修改的记录 synced=0，成功推送到服务器后改成 1。
export const MIGRATIONS = [
  `PRAGMA journal_mode = WAL;`,

  `CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    icon TEXT,
    type TEXT NOT NULL CHECK (type IN ('INCOME', 'EXPENSE')),
    parentId TEXT REFERENCES categories(id),
    synced INTEGER NOT NULL DEFAULT 0
  );`,

  `CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('CASH', 'BANK', 'EWALLET', 'CREDIT_CARD', 'OTHER')),
    currency TEXT NOT NULL DEFAULT 'MYR',
    openingBalance REAL NOT NULL DEFAULT 0,
    icon TEXT,
    createdAt TEXT NOT NULL,
    synced INTEGER NOT NULL DEFAULT 0
  );`,

  `CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    remarks TEXT,
    amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'MYR',
    exchangeRate REAL NOT NULL DEFAULT 1,
    amountInBase REAL NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('INCOME', 'EXPENSE')),
    date TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    isReimbursable INTEGER NOT NULL DEFAULT 0,
    excludeFromStats INTEGER NOT NULL DEFAULT 0,
    categoryId TEXT NOT NULL REFERENCES categories(id),
    accountId TEXT NOT NULL REFERENCES accounts(id),
    recurringId TEXT REFERENCES recurring_transactions(id),
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    synced INTEGER NOT NULL DEFAULT 0
  );`,

  `CREATE TABLE IF NOT EXISTS transaction_images (
    id TEXT PRIMARY KEY NOT NULL,
    transactionId TEXT NOT NULL REFERENCES transactions(id),
    url TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );`,

  // categoryId 本身就是天然唯一键（一个分类只有一条预算），不单独生成 id
  `CREATE TABLE IF NOT EXISTS budgets (
    categoryId TEXT PRIMARY KEY NOT NULL REFERENCES categories(id),
    amount REAL NOT NULL,
    synced INTEGER NOT NULL DEFAULT 0
  );`,

  `CREATE TABLE IF NOT EXISTS recurring_transactions (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    remarks TEXT,
    amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'MYR',
    exchangeRate REAL NOT NULL DEFAULT 1,
    type TEXT NOT NULL CHECK (type IN ('INCOME', 'EXPENSE')),
    frequency TEXT NOT NULL CHECK (frequency IN ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY')),
    startDate TEXT NOT NULL,
    nextRunDate TEXT NOT NULL,
    endDate TEXT,
    isActive INTEGER NOT NULL DEFAULT 1,
    categoryId TEXT NOT NULL REFERENCES categories(id),
    accountId TEXT NOT NULL REFERENCES accounts(id),
    createdAt TEXT NOT NULL,
    synced INTEGER NOT NULL DEFAULT 0
  );`,

  `CREATE TABLE IF NOT EXISTS transfers (
    id TEXT PRIMARY KEY NOT NULL,
    amount REAL NOT NULL,
    date TEXT NOT NULL,
    note TEXT,
    fromAccountId TEXT NOT NULL REFERENCES accounts(id),
    toAccountId TEXT NOT NULL REFERENCES accounts(id),
    createdAt TEXT NOT NULL,
    synced INTEGER NOT NULL DEFAULT 0
  );`,

  // 同步周期、上次同步时间这类不进服务器数据库的本地设置，见 docs/PROJECT-PLAN.md 第5节
  `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );`,
];
