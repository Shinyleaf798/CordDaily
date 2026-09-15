// 本地 SQLite 是唯一的数据录入入口（CLAUDE.md 核心原则#1），这里的表基本对应后端 Prisma schema，
// 但去掉了 userId（本地只服务当前登录的这一个人，不需要按用户过滤），
// 并给需要同步的表加了 synced 字段：本地新建/修改的记录 synced=0，成功推送到服务器后改成 1。
//
// MIGRATIONS 按版本号分组，下标 i 就是「从 user_version i 升到 i+1」要跑的语句（见 client.ts）。
// 只靠 CREATE TABLE IF NOT EXISTS 是不够的：老用户手机上库已经建好了，之后加的列不会被补上，
// 所以加字段必须往数组末尾追加一组新的 ALTER TABLE，而不是去改前面那组已发布的建表语句。
export const MIGRATIONS: string[][] = [
  // v1：初始表结构
  [
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
  ],

  // v2：记账表单拆出「店名」和「地点」两个可复用字段。
  // 两列都可空——随手买瓶水不会填店名，也不是每笔都记得地点。
  // 索引是给输入时的历史补全用的（按出现次数取 TOP N，见 db/transactions.ts 的 suggest* 查询）
  [
    `ALTER TABLE transactions ADD COLUMN merchant TEXT;`,
    `ALTER TABLE transactions ADD COLUMN location TEXT;`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_merchant ON transactions(merchant);`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_location ON transactions(location);`,
  ],

  // v3：报销从"一个布尔值"补成完整的两态。
  // 只有 isReimbursable 的话，标记一旦打上就再也清不掉，待报销列表会越积越长失去意义；
  // reimbursedAt 为 null 才是"待收回"，有值表示钱已经回来了
  [
    `ALTER TABLE transactions ADD COLUMN reimbursedAt TEXT;`,
    // 首页按月查账单、报销清单按状态查，都吃这两个索引
    `CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_reimbursable ON transactions(isReimbursable, reimbursedAt);`,
  ],
];
