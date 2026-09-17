# 项目规格文档

完整的数据库设计、API 接口、认证流程、页面结构。改需求或加功能，先改这份文档，再动代码。

## 1. 功能需求清单

| 模块 | 功能 |
|---|---|
| 认证 | 注册、登录、登出 |
| 记账 | 新增 / 编辑 / 复制 / 删除交易（主题、备注、金额、币种、汇率、分类、账户、日期时间、标签、图片） |
| 分类 | 两级分类（父分类 + 子分类），新增 / 编辑 / 删除；图标可选内置图片或表情，被交易引用的分类禁止删除 |
| 账户 | 多账户余额追踪（现金/银行卡/电子钱包/信用卡/其他），账户间转账 |
| 预算 | 整体月度预算：填一个总数，跟当月全部支出比；超支提醒，本地实时计算 |
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
  title            String           // 列表主行显示用，录入时按 主题 || 店名 || 分类名 兜底填充，保证非空
  merchant         String?          // 店家名，如"麦当劳"。可复用，靠客户端 DISTINCT 做历史补全
  location         String?          // 粗粒度地名，如"吉隆坡机场"。同样可复用、可补全
  remarks          String?          // 明细，如"3个汉堡，2个薯条"。每笔唯一，不做补全
  amount           Decimal
  currency         String   @default("MYR")
  exchangeRate     Decimal  @default(1)
  amountInBase     Decimal
  type             TransactionType
  date             DateTime
  tags             String[] @default([])   // 跟分类正交的第二个汇总维度：一次旅行/一场装修会横跨多个分类，用标签才圈得起来
  isReimbursable   Boolean  @default(false) // 这笔钱会回来（公司报销、朋友AA垫付）
  reimbursedAt     DateTime?                // null=待报销，有值=已收回。只有一个 isReimbursable 布尔值区分不了这两态，标记会越积越清不掉
  excludeFromStats Boolean  @default(false) // 钱动了但不算"我的消费"（代付、一次性大额）。注意账户余额不看这个字段，余额要真实
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
- **分类是两级树状结构**：`parentId` 为空代表顶级分类，有值代表子分类。
- **`Category.icon` 是一个带前缀的字符串，不拆成两列**：三种写法共用这一个 TEXT 字段——emoji（`🍜`）、内置图片引用（`builtin:food`，图打包在 `mobile/assets/categories/`，key 在 `constants/category-icons.ts` 登记）、用户图片（`file://...`，存在手机沙盒里）。没有任何查询要按图标类型过滤，拆成 `iconType` + `iconValue` 只会让每张表、每个同步 payload 都多一个字段。内置图片存的是**引用**不是文件名，所以换图、改文件名都不用动数据库里的任何一行。
- **预算只有一个总数，不按分类设**：用户填「这个月打算花多少」，口径是「本月全部支出（跳过 `excludeFromStats`）vs 那个数」。曾经做过按分类设额度、总额靠加总的版本，用下来颗粒度太细、录入成本高于它带来的信息量，已整个去掉。这条不跟「账户余额是衍生值」冲突：余额是能从流水算出来的量，存了会不一致；预算是**用户直接给的输入**，本来就没有别的地方能算出来。
- **预算存在本地 `app_settings(key, value)` 里**（key `overallMonthlyBudget`），不进服务器数据库：它是一个偏好值不是账目数据。代价是**换手机或重装 App 会丢**，等做用户设置同步时再一起推上去。
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
| GET/POST | `/recurring-transactions` | 周期规则的获取 / 新建 |
| PUT/DELETE | `/recurring-transactions/:id` | 修改（暂停）/ 删除规则 |
| POST | `/transfers/batch` | 离线同步：批量推送转账记录 |
| GET | `/transfers` | 获取转账记录 |
| GET | `/stats/summary?month=` | 月度收支总览（电脑端图表用） |
| GET | `/stats/by-category?month=` | 按分类汇总（饼图用） |

图片不走自己的后端接口——手机端直接上传到 Cloudinary，拿到 URL 后作为 `Transaction` 的一部分随 `/transactions/batch` 一起推送。

## 5. 离线同步机制

- **触发方式**：App 打开时对比 `lastSyncedAt` 与设置的周期（7天/1个月），到期自动同步；也可随时点"立即上传"手动触发，两者调用同一个同步函数
- **同步内容**：单向推送本地所有 `synced=false` 的 `Transaction`、`RecurringTransaction`、`Account`、`Transfer` 记录（预算不在其中，见下条）
- **本地额外存储**（不进服务器数据库）：
  ```
  { syncFrequency: "WEEKLY" | "MONTHLY", lastSyncedAt: "2026-09-01T00:00:00Z",
    overallMonthlyBudget: "2400" }
  ```
  都存在本地 SQLite 的 `app_settings(key, value)` 表里（v1 就建好了，值统一按字符串存）。
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
| 首页 | 两套可切换布局（节奏条 / 金环）；月度收支总览；预算进度 + 已消费/剩余额度 + 日均消费/剩余每日可消费；没设预算时给一个入口弹窗直接填；近7天账单列表，点任意一笔弹出详情层（编辑 / 复制 / 删除） |
| 日历 | 按天查看消费记录 |
| 添加账单 | 支出/收入切换；分类网格选择（末位「设置」格子通到分类管理）；主题+备注+店名+地点输入；日期+时分和账户选择；金额键盘；标签行（报销/标签/不计入统计/拍照，支持多图）。`/add?id=` 是同一页的编辑模式，保存后回首页 |
| 资产 | 账户列表 + 余额；新建/编辑账户；转账；点进账户看该账户交易历史 |
| 我的 → 分类管理 | 按收/支分组列出分类，新增/改名/换图标/删除；跟记账页「设置」格子是同一页 |
| 我的 → 预算 | 填本月总预算（跟首页「设置预算」是同一个弹窗） |
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
