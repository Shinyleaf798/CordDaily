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

  // v6：曾经给账户加过「分组」（用户自建的账户分类）。这套东西在 v7 又整个去掉了，
  // 这一组保持原样不动——已经跑过 v6 的设备 user_version 已经是 6，改它不会重跑；
  // 而把它从数组里删掉会让 MIGRATIONS.length 退回 5，那台设备之后再加新迁移就会被
  // `currentVersion >= MIGRATIONS.length` 判成已是最新而跳过。**版本号只能往前加，不能往回缩。**
  // 代价只是全新安装会先建这张表、下一组再删掉，几毫秒的事。
  [
    `CREATE TABLE IF NOT EXISTS account_groups (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'OTHER' CHECK (type IN ('CASH', 'BANK', 'EWALLET', 'CREDIT_CARD', 'OTHER')),
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0
    );`,
    `ALTER TABLE accounts ADD COLUMN groupId TEXT REFERENCES account_groups(id);`,
  ],

  // v7：账户分类整个去掉（见 DECISIONS.md）。账户存在的唯一目的是给一笔账贴上
  // 「我用什么付的」——再给这些标签分一次类，在只有两三个账户时是纯仪式感。
  //
  // **两句的顺序不能反**：先删 accounts 上那个指向 account_groups 的外键列，再删表。
  // 反过来先 DROP TABLE 的话，在开了 `PRAGMA foreign_keys` 的设备上会报
  // FOREIGN KEY constraint failed（父表还被子表引用着）；就算绕过去删成功了，
  // accounts 表定义里那句 `REFERENCES account_groups(id)` 还在、却指向一张不存在的表，
  // 之后每一次插入账户都会失败。按这个顺序则两种外键设置下都干净（都实测过）。
  //
  // DROP COLUMN 需要 SQLite 3.35+（2021 年），Expo SDK 57 带的远高于这个版本。
  [
    `ALTER TABLE accounts DROP COLUMN groupId;`,
    `DROP TABLE IF EXISTS account_groups;`,
  ],

  // v8：分类加「排列顺序」和「是否启用」两列（见 docs/PROJECT-PLAN.md 的关键取舍）。
  //
  // 第三句给已有分类编号。不编的话所有行都是默认的 0，ORDER BY sortOrder 退化成
  // 一堆并列第一，拖动排序没有起点——用户拖完第一下，剩下那些仍然是 0 的行会乱跳。
  // 相关子查询数的是「同一组里排在我前面的行数」：同一组 = 同收支类型、同一个父
  // （IFNULL 把 NULL 折成空串，因为 SQL 里 NULL = NULL 不成立，一级分类之间会互相判不等）。
  [
    `ALTER TABLE categories ADD COLUMN sortOrder INTEGER NOT NULL DEFAULT 0;`,
    `ALTER TABLE categories ADD COLUMN isActive INTEGER NOT NULL DEFAULT 1;`,
    `UPDATE categories SET sortOrder = (
       SELECT COUNT(*) FROM categories AS earlier
       WHERE earlier.rowid < categories.rowid
         AND earlier.type = categories.type
         AND IFNULL(earlier.parentId, '') = IFNULL(categories.parentId, '')
     );`,
  ],

  // v9：主题也加入历史补全（原来只有店名和地点）。索引的用途跟 v2 给 merchant/location
  // 建的那两个一样：补全查询要 GROUP BY 这一列再按出现次数排序，有索引就不用每次全表扫。
  [
    `CREATE INDEX IF NOT EXISTS idx_transactions_title ON transactions(title);`,
  ],

  // 曾经有过一组 v10：把老设备上那批**随机生成**的内置分类 / 内置账户 id 改成
  // `constants/default-categories.ts` 里的常量（一百多条从常量数组生成的 UPDATE）。
  //
  // 整组删掉了，因为项目还在开发期，库可以随时清空——那组语句唯一的用户就是"已经装过 App 的设备"，
  // 而这里没有那样的设备。清一次数据、重装，seed 直接按常量灌，效果一样，代码少一百多行。
  //
  // 删它是**对上面 v6 那条「版本号只能往前加」的一次有意违反**：那条规矩保护的是
  // 已经跑过该版本的设备，而 v10 从没在任何设备上跑过（写完当天就删了）。
  // 发布之后不再有这种自由——到时候只能追加 v11，哪怕它做的事跟 v10 一样。
  //
  // 顺带记一个当时踩到的坑，值得留着：改主键的 UPDATE **不能**把定位条件写成
  // `WHERE id = (SELECT ... AND id <> 常量 ORDER BY rowid LIMIT 1)`。同名两行时，
  // 第一行改成常量 id 之后子查询重新求值会指向第二行，第二行也被改成同一个 id，撞主键。
  // 要写成 `rowid = (SELECT MIN(rowid) ...)`——它的结果不随这次 UPDATE 改变。
];