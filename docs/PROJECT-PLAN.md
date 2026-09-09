# 项目规格文档

完整的数据库设计、API 接口、认证流程、页面结构。改需求或加功能，先改这份文档，再动代码。

## 1. 功能需求清单

| 模块 | 功能 |
|---|---|
| 认证 | 注册、登录、登出 |
| 记账 | 新增 / 编辑 / 删除交易（主题、备注、金额、币种、汇率、分类、账户、日期时间、标签、图片） |
| 分类 | 两级分类（父分类 + 子分类），新增 / 编辑 / 删除 |
| 账户 | 多账户余额追踪（现金/银行卡/电子钱包/信用卡/其他），账户间转账 |
| 预算 | 各分类月度预算上限，超支提醒，本地实时计算 |
| 周期性交易 | 设置规则（频率/金额/分类/账户），本地自动补生成 |
| 同步 | 本地 SQLite 存储，按周期（7天/1个月）自动同步或手动"立即同步"，单向推送 |
| 统计（电脑端） | 月度收支趋势图、分类占比图、预算达成情况，均为只读 |

## 2. 数据库设计（Prisma Schema）

```prisma
enum TransactionType {
  INCOME
  EXPENSE
}

enum RecurringFrequency {
  DAILY
  WEEKLY
  MONTHLY
  YEARLY
}

enum AccountType {
  CASH
  BANK
  EWALLET
  CREDIT_CARD
  OTHER
}

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  name         String?
  baseCurrency String   @default("MYR")
  createdAt    DateTime @default(now())

  categories             Category[]
  transactions           Transaction[]
  budgets                Budget[]
  recurringTransactions  RecurringTransaction[]
  accounts               Account[]
  transfers              Transfer[]
}

model Category {
  id       String   @id @default(uuid())
  name     String
  icon     String?
  type     TransactionType
  userId   String
  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  parentId String?
  parent   Category?  @relation("SubCategory", fields: [parentId], references: [id])
  children Category[] @relation("SubCategory")

  transactions           Transaction[]
  budgets                Budget[]
  recurringTransactions  RecurringTransaction[]
}

model Account {
  id             String      @id @default(uuid())
  name           String
  type           AccountType
  currency       String      @default("MYR")
  openingBalance Decimal     @default(0)
  icon           String?
  userId         String
  user           User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt      DateTime    @default(now())

  transactions          Transaction[]
  recurringTransactions RecurringTransaction[]
  transfersOut          Transfer[] @relation("FromAccount")
  transfersIn           Transfer[] @relation("ToAccount")
}

model Transaction {
  id               String   @id   // 客户端生成的UUID，不用@default(uuid())
  title            String
  remarks          String?
  amount           Decimal
  currency         String   @default("MYR")
  exchangeRate     Decimal  @default(1)
  amountInBase     Decimal
  type             TransactionType
  date             DateTime
  tags             String[] @default([])
  isReimbursable   Boolean  @default(false)
  excludeFromStats Boolean  @default(false)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  categoryId String
  category   Category @relation(fields: [categoryId], references: [id])
  accountId  String
  account    Account  @relation(fields: [accountId], references: [id])
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  recurringId String?
  recurring   RecurringTransaction? @relation(fields: [recurringId], references: [id])

  images TransactionImage[]
}

model TransactionImage {
  id            String      @id @default(uuid())
  url           String              // Cloudinary 图片地址
  transactionId String
  transaction   Transaction @relation(fields: [transactionId], references: [id], onDelete: Cascade)
  createdAt     DateTime    @default(now())
}

model Budget {
  id         String   @id @default(uuid())
  amount     Decimal          // 以用户基准货币计算的月度预算上限
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  categoryId String
  category   Category @relation(fields: [categoryId], references: [id])
  createdAt  DateTime @default(now())

  @@unique([userId, categoryId])
}

model RecurringTransaction {
  id           String   @id
  title        String
  remarks      String?
  amount       Decimal
  currency     String   @default("MYR")
  exchangeRate Decimal  @default(1)
  type         TransactionType
  frequency    RecurringFrequency
  startDate    DateTime
  nextRunDate  DateTime           // 下次该生成记录的日期，App打开时检查
  endDate      DateTime?
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())

  categoryId String
  category   Category @relation(fields: [categoryId], references: [id])
  accountId  String
  account    Account  @relation(fields: [accountId], references: [id])
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  generatedTransactions Transaction[]
}

model Transfer {
  id            String   @id
  amount        Decimal
  date          DateTime
  note          String?
  fromAccountId String
  fromAccount   Account  @relation("FromAccount", fields: [fromAccountId], references: [id])
  toAccountId   String
  toAccount     Account  @relation("ToAccount", fields: [toAccountId], references: [id])
  userId        String
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt     DateTime @default(now())
}
```

### 关键设计取舍

- **`amountInBase` 在写入时就算好**：汇率由用户手动从 Wise 查到后输入，跟这笔交易强绑定，不是可以事后用"今天的汇率"重新计算的值；顺带也省了统计时每次都要转换汇率的开销。
- **`id` 由客户端生成**：手机离线创建的记录，从诞生那一刻起 id 就确定，同步时用它做幂等去重，避免网络重试造成重复数据。
- **分类是两级树状结构**：`parentId` 为空代表顶级分类，有值代表子分类。预算可以设在父分类或子分类任一层级，不强制颗粒度。
- **账户余额是衍生值**：不存 `balance` 字段，用 `openingBalance + 交易/转账汇总` 实时计算，避免离线同步造成余额缓存不一致。
- **周期交易和转账都是独立模型**：`RecurringTransaction` 是"规则"，生成的每一笔仍然是真实的 `Transaction`；`Transfer` 独立于 `Transaction`，因为转账不计入收支统计。
- **图片只存 URL**：图片本身直传 Cloudinary，后端和数据库都不碰二进制数据。
- **`updatedAt` 字段预留给未来的网页编辑功能**：现在电脑端只读用不上，但先加上，以后要做双向同步时可以直接用"谁更新时间新听谁的"（last-write-wins）策略处理冲突。
- **删除策略：只在两处加 `onDelete: Cascade`**：`User → 所有子表`（方便以后做"注销账号"，删用户时自动清掉名下所有数据，不用一张张表手动删）、`Transaction → TransactionImage`（图片是交易的附属品，删交易应该连图片记录一起删）。其余关系（`Category → Transaction`、`Account → Transaction` 等）故意不加 Cascade，用 Prisma 默认的 `Restrict`：还有交易记录引用着的分类/账户不允许被删除，逼用户先处理这些交易，避免"删个分类，几十笔账单记录跟着消失"的误删事故。

## 3. 认证流程

- 注册：密码用 bcrypt 加密存储
- 登录：签发 access token（15分钟过期）+ refresh token（7-30天）
- 每次请求带 access token；过期后用 refresh token 换新的，不用重新登录
- 手机端 token 存 `expo-secure-store`

## 4. API 接口

| 方法 | 路径 | 作用 |
|---|---|---|
| POST | `/auth/register` | 注册 |
| POST | `/auth/login` | 登录，返回 access + refresh token |
| POST | `/auth/refresh` | 用 refresh token 换新 access token |
| GET | `/auth/me` | 获取当前用户信息 |
| GET/POST | `/categories` | 分类的获取 / 新建 |
| PUT/DELETE | `/categories/:id` | 修改 / 删除分类 |
| GET/POST | `/accounts` | 账户的获取 / 新建 |
| PUT/DELETE | `/accounts/:id` | 修改 / 删除账户 |
| GET | `/accounts/:id/balance` | 计算该账户当前余额 |
| GET | `/transactions?from=&to=&categoryId=&accountId=&type=` | 查询交易，支持筛选 |
| POST | `/transactions/batch` | 离线同步：批量推送本地未同步的交易 |
| PUT/DELETE | `/transactions/:id` | 修改 / 删除单笔交易 |
| GET/POST | `/budgets` | 预算的获取 / 新建 |
| GET | `/budgets/status?month=` | 各分类预算 vs 实际花费 |
| GET/POST | `/recurring-transactions` | 周期规则的获取 / 新建 |
| PUT/DELETE | `/recurring-transactions/:id` | 修改（暂停）/ 删除规则 |
| POST | `/transfers/batch` | 离线同步：批量推送转账记录 |
| GET | `/transfers` | 获取转账记录 |
| GET | `/stats/summary?month=` | 月度收支总览（电脑端图表用） |
| GET | `/stats/by-category?month=` | 按分类汇总（饼图用） |

图片不走自己的后端接口——手机端直接上传到 Cloudinary，拿到 URL 后作为 `Transaction` 的一部分随 `/transactions/batch` 一起推送。

## 5. 离线同步机制

- **触发方式**：App 打开时对比 `lastSyncedAt` 与设置的周期（7天/1个月），到期自动同步；也可随时点"立即上传"手动触发，两者调用同一个同步函数
- **同步内容**：单向推送本地所有 `synced=false` 的 `Transaction`、`Budget`、`RecurringTransaction`、`Account`、`Transfer` 记录
- **本地额外存储**（不进服务器数据库）：
  ```
  { syncFrequency: "WEEKLY" | "MONTHLY", lastSyncedAt: "2026-09-01T00:00:00Z" }
  ```
- **周期交易生成逻辑**（App 打开时执行）：
  ```
  对每条 active 的周期规则：
    while (规则.nextRunDate <= 今天 且未超过 endDate):
        本地创建一笔交易（synced = false，date = 规则.nextRunDate）
        推进 规则.nextRunDate（按频率）
    保存更新后的 nextRunDate
  ```

## 6. 页面结构

### 手机端

底部导航（5个）：**首页 / 日历 / ＋添加（居中凸起圆形按钮）/ 资产 / 我的**

| 页面 | 内容 |
|---|---|
| 首页 | 月度收支总览卡片；预算环形进度条 + 已消费/剩余额度 + 日均消费/剩余每日可消费；近7天账单列表（含"全部账单"入口） |
| 日历 | 按天查看消费记录 |
| 添加账单 | 支出/收入/转账切换；两级分类网格选择；主题+备注输入；金额键盘；标签行（报销/标签/不计入统计/拍照，支持多图） |
| 资产 | 账户列表 + 余额；新建/编辑账户；转账；点进账户看该账户交易历史 |
| 我的 → 分类管理 | 新增/编辑/删除两级分类 |
| 我的 → 预算设置 | 设置各分类月度预算 |
| 我的 → 周期交易 | 新增/暂停/删除周期规则 |
| 我的 → 同步设置 | 选择同步周期、立即同步按钮、显示上次同步时间和待同步笔数 |

### 电脑端（网页，只读）

| 页面 | 内容 |
|---|---|
| 登录页 | 邮箱密码登录 |
| Dashboard | 月度收支趋势图、分类占比饼图 |
| 账单列表 | 按月/分类筛选查看明细（只读，MVP阶段不可编辑） |
| 预算总览 | 各分类预算使用进度（只读） |
| 设置 | 账户信息、登出 |

## 7. 部署方案（不租服务器）

| 层 | 服务 |
|---|---|
| 数据库 | Neon（免费 Serverless PostgreSQL） |
| 后端 | Render 免费 Web Service（闲置会休眠，首次请求冷启动约20-30秒） |
| 网页 | Vercel 免费套餐 |
| 手机端构建 | Expo EAS（免费层每月构建次数有限） |
| 图片 | Cloudinary 免费额度 |

不需要任何定时任务服务（GitHub Actions 或类似），因为周期交易生成已改为手机本地执行。
