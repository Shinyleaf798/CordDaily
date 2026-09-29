/**
 * 用户自己那个 Neon 库的表结构。
 *
 * **逐字对齐 `backend/prisma/schema.prisma`**：表名、列名、枚举名、Decimal 精度全部照抄
 * Prisma 默认会生成的那一份（模型名就是表名，所以是带引号的 `"Transaction"` 而不是
 * `transactions`；列名是 camelCase，同样要引号）。对齐的理由不是洁癖——它让**同一个库**
 * 既能被手机直连写入，也能被现有的 Express + Prisma 后端读（以后电脑端要看图表时），
 * 不用维护两套互相翻译的结构。偏离一个字母，那条路就断了。
 *
 * 跟本地 `db/schema.ts` 同一个写法：`MIGRATIONS[i]` 就是「从版本 i 升到 i+1」要跑的语句。
 * 区别是版本号存在哪——SQLite 有内置的 `user_version`，Postgres 没有，所以多一张 `app_meta`。
 *
 * **加字段必须往数组末尾追加一组新的 ALTER TABLE，不能回头改前面已经发布过的建表语句。**
 * 这条在这里比在本地严格得多：本地库是用户自己的，改坏了大不了清库重来；
 * 这些语句要跑在**陌生人的数据库**上，里面装着他唯一的一份账，你看不见也救不了。
 * 所以只做加法——加表、加可空列、加索引。改主键、删列、改类型在这条路上是不可接受的。
 */

/**
 * `app_meta` 单独拎出来，在版本化的迁移**之前**无条件跑一次。
 *
 * 鸡生蛋的问题：迁移执行器要先读 `app_meta.schemaVersion` 才知道该从第几组开始跑，
 * 而这张表本身也得有人建。把它放进 v1 的话，第一次连接时读版本号会直接报「表不存在」。
 *
 * `id INTEGER PRIMARY KEY CHECK (id = 1)` 是单行表的写法：这张表天然只该有一行，
 * 用约束表达出来，比在代码里每次都记得带 `WHERE id = 1` 可靠。
 */
export const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS "app_meta" (
  "id" INTEGER PRIMARY KEY CHECK ("id" = 1),
  "schemaVersion" INTEGER NOT NULL DEFAULT 0,
  "bookId" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "lastPushAt" TIMESTAMPTZ,
  "lastPushApp" TEXT
)`;

export const REMOTE_MIGRATIONS: string[][] = [
  // ---- v1：跟 Prisma schema 对齐的全套表 ----
  [
    // CREATE TYPE 没有 IF NOT EXISTS，只能靠捕获 duplicate_object。
    // 迁移本来就只跑一次，这层保护是为了"库里已经被 prisma migrate 建过"的情况
    `DO $do$ BEGIN
       CREATE TYPE "TransactionType" AS ENUM ('INCOME', 'EXPENSE');
     EXCEPTION WHEN duplicate_object THEN NULL; END $do$`,

    `DO $do$ BEGIN
       CREATE TYPE "RecurringFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');
     EXCEPTION WHEN duplicate_object THEN NULL; END $do$`,

    `DO $do$ BEGIN
       CREATE TYPE "AccountType" AS ENUM ('CASH', 'BANK', 'EWALLET', 'CREDIT_CARD', 'OTHER');
     EXCEPTION WHEN duplicate_object THEN NULL; END $do$`,

    // User 表照建，尽管这条路上没有注册也没有登录：所有业务表的 userId 外键指着它，
    // 而那个外键是 Prisma schema 的一部分，拆掉就跟后端那份对不上了。
    // App 初始化时自己往里写唯一的一行（见 neon/client.ts 的 initializeRemote），
    // email / passwordHash 填占位值——连接串本身就是这个库的凭证，
    // 再存一个密码哈希保护不了任何东西：能读到这一行的人已经能读到全部账单
    `CREATE TABLE IF NOT EXISTS "User" (
      "id" TEXT NOT NULL,
      "email" TEXT NOT NULL,
      "passwordHash" TEXT NOT NULL,
      "name" TEXT,
      "baseCurrency" TEXT NOT NULL DEFAULT 'MYR',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "User_pkey" PRIMARY KEY ("id")
    )`,

    `CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email")`,

    // 主键是 (userId, id) 而不是全局唯一的 id：内置分类的 UUID 写死在
    // constants/default-categories.ts 里，每台设备都是同一批（CLAUDE.md 原则#2）。
    // 一个库一个账本的话这一列恒等于同一个值，但**不要因此把它删掉**——
    // 删了它就要重做每一张表的主键和外键，而那种迁移要跑在别人的库上
    `CREATE TABLE IF NOT EXISTS "Category" (
      "id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "icon" TEXT,
      "type" "TransactionType" NOT NULL,
      "userId" TEXT NOT NULL,
      "parentId" TEXT,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      CONSTRAINT "Category_pkey" PRIMARY KEY ("userId", "id"),
      CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId")
        REFERENCES "User"("id") ON DELETE CASCADE,
      CONSTRAINT "Category_parent_fkey" FOREIGN KEY ("userId", "parentId")
        REFERENCES "Category"("userId", "id")
    )`,

    `CREATE TABLE IF NOT EXISTS "Account" (
      "id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "type" "AccountType" NOT NULL,
      "currency" TEXT NOT NULL DEFAULT 'MYR',
      "openingBalance" DECIMAL(65,30) NOT NULL DEFAULT 0,
      "icon" TEXT,
      "userId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Account_pkey" PRIMARY KEY ("userId", "id"),
      CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId")
        REFERENCES "User"("id") ON DELETE CASCADE
    )`,

    // 图片本体真的存在这儿（bytea），不走图床——见 Prisma schema 上那段说明。
    // 故意不跟 Category 建外键：图标的生命周期比分类长一截
    `CREATE TABLE IF NOT EXISTS "CategoryIcon" (
      "name" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "mimeType" TEXT NOT NULL,
      "data" BYTEA NOT NULL,
      "size" INTEGER NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "CategoryIcon_pkey" PRIMARY KEY ("userId", "name"),
      CONSTRAINT "CategoryIcon_userId_fkey" FOREIGN KEY ("userId")
        REFERENCES "User"("id") ON DELETE CASCADE
    )`,

    `CREATE TABLE IF NOT EXISTS "RecurringTransaction" (
      "id" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "remarks" TEXT,
      "amount" DECIMAL(65,30) NOT NULL,
      "currency" TEXT NOT NULL DEFAULT 'MYR',
      "exchangeRate" DECIMAL(65,30) NOT NULL DEFAULT 1,
      "type" "TransactionType" NOT NULL,
      "frequency" "RecurringFrequency" NOT NULL,
      "startDate" TIMESTAMP(3) NOT NULL,
      "nextRunDate" TIMESTAMP(3) NOT NULL,
      "endDate" TIMESTAMP(3),
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "categoryId" TEXT NOT NULL,
      "accountId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      CONSTRAINT "RecurringTransaction_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "RecurringTransaction_userId_fkey" FOREIGN KEY ("userId")
        REFERENCES "User"("id") ON DELETE CASCADE,
      CONSTRAINT "RecurringTransaction_category_fkey" FOREIGN KEY ("userId", "categoryId")
        REFERENCES "Category"("userId", "id"),
      CONSTRAINT "RecurringTransaction_account_fkey" FOREIGN KEY ("userId", "accountId")
        REFERENCES "Account"("userId", "id")
    )`,

    `CREATE TABLE IF NOT EXISTS "Transaction" (
      "id" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "merchant" TEXT,
      "location" TEXT,
      "remarks" TEXT,
      "amount" DECIMAL(65,30) NOT NULL,
      "currency" TEXT NOT NULL DEFAULT 'MYR',
      "exchangeRate" DECIMAL(65,30) NOT NULL DEFAULT 1,
      "amountInBase" DECIMAL(65,30) NOT NULL,
      "type" "TransactionType" NOT NULL,
      "date" TIMESTAMP(3) NOT NULL,
      "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      "isReimbursable" BOOLEAN NOT NULL DEFAULT false,
      "reimbursedAt" TIMESTAMP(3),
      "excludeFromStats" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "categoryId" TEXT NOT NULL,
      "accountId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "recurringId" TEXT,
      CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId")
        REFERENCES "User"("id") ON DELETE CASCADE,
      CONSTRAINT "Transaction_category_fkey" FOREIGN KEY ("userId", "categoryId")
        REFERENCES "Category"("userId", "id"),
      CONSTRAINT "Transaction_account_fkey" FOREIGN KEY ("userId", "accountId")
        REFERENCES "Account"("userId", "id"),
      CONSTRAINT "Transaction_recurring_fkey" FOREIGN KEY ("recurringId")
        REFERENCES "RecurringTransaction"("id")
    )`,

    // 查得最多的两条路：按月看账（userId + date）和按分类统计（userId + categoryId）。
    // 免费实例上几千行其实全表扫也不慢，但索引是纯加法、以后想加反而要在别人库上跑 DDL
    `CREATE INDEX IF NOT EXISTS "Transaction_userId_date_idx" ON "Transaction"("userId", "date")`,
    `CREATE INDEX IF NOT EXISTS "Transaction_userId_categoryId_idx" ON "Transaction"("userId", "categoryId")`,

    `CREATE TABLE IF NOT EXISTS "TransactionImage" (
      "id" TEXT NOT NULL,
      "url" TEXT NOT NULL,
      "transactionId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "TransactionImage_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "TransactionImage_transactionId_fkey" FOREIGN KEY ("transactionId")
        REFERENCES "Transaction"("id") ON DELETE CASCADE
    )`,

    `CREATE TABLE IF NOT EXISTS "Transfer" (
      "id" TEXT NOT NULL,
      "amount" DECIMAL(65,30) NOT NULL,
      "date" TIMESTAMP(3) NOT NULL,
      "note" TEXT,
      "fromAccountId" TEXT NOT NULL,
      "toAccountId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "Transfer_userId_fkey" FOREIGN KEY ("userId")
        REFERENCES "User"("id") ON DELETE CASCADE,
      CONSTRAINT "Transfer_from_fkey" FOREIGN KEY ("userId", "fromAccountId")
        REFERENCES "Account"("userId", "id"),
      CONSTRAINT "Transfer_to_fkey" FOREIGN KEY ("userId", "toAccountId")
        REFERENCES "Account"("userId", "id")
    )`,
  ],
];

/** App 认识的最新远端版本。库里的 `schemaVersion` 比它大 = 这台手机的 App 太旧了 */
export const REMOTE_SCHEMA_VERSION = REMOTE_MIGRATIONS.length;

/**
 * 备份真正会读写的列，按表列出来。**连接时拿它跟库里的实际情况对一遍。**
 *
 * ## 为什么光靠建表语句不够
 *
 * 上面那些全是 `CREATE TABLE IF NOT EXISTS`——表已经存在时它**一个字都不改**，
 * 而且不报错。于是一个"表在、但少一列"的库会顺顺利利地连上、显示已就绪，
 * 等到第一次推账单才炸在 `column "merchant" of relation "Transaction" does not exist` 上。
 *
 * 这不是假想：任何一个以前用 `prisma migrate` 建过、之后 schema 又往前走过的库都是这样，
 * 包括开发者自己那个。而这种库恰恰是最该连上来的——里面有真的账。
 *
 * ## 为什么只列这些列，不列全部
 *
 * 这份清单回答的是"**备份跑不跑得起来**"，不是"表结构跟 Prisma 一不一样"。
 * 多一列无所谓，少一列才要命。所以只列 api/neon-transport.ts 真的会 INSERT 或 SELECT 的，
 * 漏掉的（比如没人读的 createdAt 默认值）少了也不影响任何一笔账。
 *
 * **加新列时这里要跟着加一行**，否则旧库上那一列缺失会重新变成一个运行时错误。
 */
export const REQUIRED_COLUMNS: Record<string, string[]> = {
  User: ['id', 'email', 'passwordHash'],
  Category: ['id', 'name', 'icon', 'type', 'userId', 'parentId', 'sortOrder', 'isActive'],
  Account: ['id', 'name', 'type', 'currency', 'openingBalance', 'icon', 'userId', 'createdAt'],
  CategoryIcon: ['name', 'userId', 'mimeType', 'data', 'size'],
  Transaction: [
    'id', 'title', 'merchant', 'location', 'remarks', 'amount', 'currency', 'exchangeRate',
    'amountInBase', 'type', 'date', 'tags', 'isReimbursable', 'reimbursedAt', 'excludeFromStats',
    'categoryId', 'accountId', 'userId', 'recurringId', 'createdAt', 'updatedAt',
  ],
  TransactionImage: ['id', 'url', 'transactionId'],
  RecurringTransaction: [
    'id', 'title', 'remarks', 'amount', 'currency', 'exchangeRate', 'type', 'frequency',
    'startDate', 'nextRunDate', 'endDate', 'isActive', 'categoryId', 'accountId', 'userId',
  ],
  Transfer: ['id', 'amount', 'date', 'note', 'fromAccountId', 'toAccountId', 'userId'],
};
