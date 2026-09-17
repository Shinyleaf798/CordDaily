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

  // 这张表在 v4 被删掉了（预算改成"一个月一个总数"，存在 app_settings 里）。
  // 建表语句仍然留在 v1 不能拿掉：v1 是已发布版本，改它会让老设备的迁移路径跟新设备不一致——
  // 新设备会 建表→删表，老设备是 建表(早就跑过)→删表，两条路径的终点必须一样。
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

  // v4：删掉分类预算表。预算改成"一个月一个总数"，存在 app_settings 的
  // overallMonthlyBudget 里（见 db/budgets.ts）。分类颗粒度太细，录入成本高于它带来的信息量。
  [
    `DROP TABLE IF EXISTS budgets;`,
  ],

  // v5：默认分类的图标从 emoji 改成 `builtin:key` 引用（见 constants/category-icons.ts）。
  // 只改代码里的 DEFAULT_CATEGORIES 是不够的——seedDefaultCategories 只在空库时跑一次，
  // 已经装过 App 的设备永远轮不到它，那些机器上的默认分类会一直停在 emoji，
  // 以后把图片放进 assets/categories/ 也不会显示。
  //
  // 按 emoji 精确匹配来改，所以顶多误伤到"用户自建了一个也用 🍜 的分类"——
  // 那种情况改完显示的仍然是同一个 🍜（图片没登记时落回兜底 emoji），看不出差别。
  [
    `UPDATE categories SET icon = 'builtin:food' WHERE icon = '🍜';`,
    `UPDATE categories SET icon = 'builtin:shopping' WHERE icon = '🛍️';`,
    `UPDATE categories SET icon = 'builtin:transport' WHERE icon = '🚌';`,
    `UPDATE categories SET icon = 'builtin:daily' WHERE icon = '🏠';`,
    `UPDATE categories SET icon = 'builtin:entertainment' WHERE icon = '🎮';`,
    `UPDATE categories SET icon = 'builtin:medical' WHERE icon = '💊';`,
    `UPDATE categories SET icon = 'builtin:study' WHERE icon = '📚';`,
    `UPDATE categories SET icon = 'builtin:social' WHERE icon = '🤝';`,
    `UPDATE categories SET icon = 'builtin:other' WHERE icon = '📦';`,
    `UPDATE categories SET icon = 'builtin:salary' WHERE icon = '💰';`,
    `UPDATE categories SET icon = 'builtin:bonus' WHERE icon = '🧧';`,
    `UPDATE categories SET icon = 'builtin:parttime' WHERE icon = '💼';`,
    `UPDATE categories SET icon = 'builtin:refund' WHERE icon = '💵';`,
  ],
];
