# 项目：个人记账 App（Portfolio 项目）

## 项目定位

本地优先（local-first）的个人消费记账应用。手机端负责记账，电脑端做只读的账单查看和统计图表。这是一个学习型 portfolio 项目——AI 负责实现代码，但每完成一个功能都要记录设计决策，方便开发者回顾理解、之后转化成学习笔记。

## 技术栈

| 层 | 技术 |
|---|---|
| 数据库 | PostgreSQL（Neon 免费 Serverless） |
| 后端 | Node.js + Express + Prisma ORM |
| 认证 | JWT（access token 15分钟过期 + refresh token） |
| 手机端 | React Native + Expo（TypeScript），Expo Router 导航，React Query 数据请求，Zustand 全局状态，expo-sqlite 本地数据库，expo-secure-store 存 token |
| 电脑端 | Next.js（App Router）+ Recharts / ECharts |
| 图片存储 | Cloudinary（客户端直传，后端只存 URL，不经过自己的服务器） |
| 部署 | 后端 → Render 免费 Web Service；数据库 → Neon；网页 → Vercel；App → Expo EAS |

不租用独立服务器，全部使用免费托管服务。

## 核心架构原则

这几条是贯穿整个项目的设计决策，写代码时必须遵守：

1. **本地优先，单向推送**：手机本地 SQLite 是唯一的数据录入源头。自动同步**默认关闭**，由用户自己打开并选周期（每天 / 每 7 天 / 每月），也可以随时手动点「备份到云端」——两者走同一个函数，都只把本地「还没备份过」的记录**单向推**给服务器。服务器只有一种情况会往手机送数据：**重装后的首次恢复**（本地库是空的 + 用户明确点了「恢复」，拉一份完整快照回来）。除此之外不反向推送——一旦允许往有数据的库里拉，就得处理冲突、删除墓碑、版本向量，那是另一个子系统（网页编辑同理，是独立的后续阶段）。

2. **客户端生成 ID**：所有主表记录的 `id` 由手机端在本地创建时就生成好 UUID，Prisma schema 里不用 `@default(uuid())`。这样离线创建的记录 id 全局唯一，同步时后端可以用这个 id 做幂等去重（`skipDuplicates` 或 upsert），不怕网络重试导致重复插入。**13 个内置分类是特例**：它们的 UUID 写死在 `constants/default-categories.ts` 里，每台设备完全一样，所以重装后备份里的 `categoryId` 不用改写就能对上。代价是这批 id 在所有用户之间共享，服务器上 `Category` / `Account` 的主键因此是 `@@id([userId, id])` 复合键。

3. **导出、云端备份、恢复共用一份 bundle**：导出文件和 `GET /sync/bundle` 返回的是**同一个 JSON 结构**，所以恢复只有一套代码（`planImport` / `applyImport`），数据从文件来还是从服务器来它不关心。备份包必须自解释——交易里出现的任何 id，同一份包里都要找得到它指的是什么，所以分类和账户是包的必需组成部分，不是可勾选项。

4. **周期性交易在本地生成，不靠服务器定时任务**：App 打开时，检查每条 `RecurringTransaction` 规则的 `nextRunDate`，本地循环补生成所有到期未生成的交易（支持长期不打开 App 后的"补生成"）。

5. **预算超支判断在本地计算**：不依赖服务器实时数据，保证即使很久没同步，手机端看到的预算提醒依然是准的。

6. **后端职责单一**：只做鉴权、存储、统计聚合（`GROUP BY` / `SUM` 这类 SQL 层聚合）、给电脑端提供只读数据。不跑定时任务，不处理图片二进制数据。

7. **账户余额是衍生值，不是存储字段**：账户当前余额 = `openingBalance + 交易/转账汇总`，每次都是现算，不在数据库里存一个会被更新的 `balance` 字段，避免离线同步导致余额缓存跟实际不一致。

## 开发约定

- 每完成一个功能模块，在 `DECISIONS.md` 追加一条记录：做了什么改动 / 为什么这样设计 / 放弃了什么替代方案
- Commit message 必须说明改动原因，不只是描述改了什么（例：`改用JWT而非session，因为要支持移动端无状态认证`）
- 功能规格、API 接口列表、认证流程、页面结构见 `docs/PROJECT-PLAN.md`，数据表的精确定义（字段类型、默认值、关系）以 `backend/prisma/schema.prisma` 为准——改动数据库结构或加新功能前先更新 PROJECT-PLAN，再动代码
- 每个关键接口/模块完成后，附一句注释说明设计意图

## 目录结构

```
backend/
├── prisma/schema.prisma
├── src/
│   ├── routes/       # URL路径，映射到controller
│   ├── controllers/  # 解析请求参数，调用service，格式化响应
│   ├── services/      # 业务逻辑（预算超支判断、统计聚合等）
│   ├── middleware/    # auth.middleware（JWT校验）、error.middleware（统一错误格式）
│   ├── config/
│   └── app.js

mobile/                # TypeScript；Expo SDK 57 默认模板把 app/ 放在 src/ 下面，顺着这个约定走，不搬到根目录
├── src/
│   ├── app/          # Expo Router 路由页面
│   ├── api/          # axios实例 + 各模块请求函数
│   ├── db/            # expo-sqlite 本地数据库操作、同步逻辑
│   ├── hooks/         # React Query hooks + 页面级取数 hook（如 use-home-view-data）
│   ├── store/         # zustand store
│   ├── utils/         # 纯函数工具（金额格式化等）
│   ├── constants/     # 主题色板、布局清单等静态配置
│   └── components/
│       ├── ui/              # 不认识任何业务概念的展示件（themed-text/view、进度条）
│       ├── transaction/     # 「一笔交易长什么样」，跨页面复用
│       ├── navigation/      # app 骨架（底部 tab bar）
│       ├── auth/            # 登录/注册共用
│       ├── home/            # 首页专属，含 layouts/ 下的可切换布局
│       ├── add-transaction/ # 记账页专属
│       ├── stats/           # 统计页专属
│       └── account/         # 账户管理页专属

web/
├── app/              # Next.js App Router 页面
├── components/
│   └── charts/
```

### components/ 的两条归类规则

1. **顶层不放散文件，只放目录**。看到 `components/` 底下直接躺着一个 `.tsx`，就是还没归好类。
2. **目录名回答「谁在用」**：只有一个页面用 → 放那个页面的目录；跨页面用 → 按领域分。
   判断一个件该进 `ui/` 还是某个页面目录，看它**认不认识业务概念**——`PaceBar` 只知道
   「一个进度 + 一个参考位置」，不认识「预算」，所以进 `ui/`，哪怕目前只有首页在用。
   反过来，`transaction-list-item` 认识「收入/支出」，但它描述的是跨页面的领域概念，
   所以进 `transaction/` 而不是 `home/`——放进 `home/` 会逼着日历页从 home 里 import。

## 统一 API 响应格式

```json
// 成功
{ "success": true, "data": { ... }, "error": null }

// 失败
{ "success": false, "data": null, "error": { "code": "...", "message": "..." } }
```
