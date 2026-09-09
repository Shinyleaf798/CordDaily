# 项目：个人记账 App（Portfolio 项目）

## 项目定位

本地优先（local-first）的个人消费记账应用。手机端负责记账，电脑端做只读的账单查看和统计图表。这是一个学习型 portfolio 项目——AI 负责实现代码，但每完成一个功能都要记录设计决策，方便开发者回顾理解、之后转化成学习笔记。

## 技术栈

| 层 | 技术 |
|---|---|
| 数据库 | PostgreSQL（Neon 免费 Serverless） |
| 后端 | Node.js + Express + Prisma ORM |
| 认证 | JWT（access token 15分钟过期 + refresh token） |
| 手机端 | React Native + Expo，Expo Router 导航，React Query 数据请求，Zustand 全局状态，expo-sqlite 本地数据库，expo-secure-store 存 token |
| 电脑端 | Next.js（App Router）+ Recharts / ECharts |
| 图片存储 | Cloudinary（客户端直传，后端只存 URL，不经过自己的服务器） |
| 部署 | 后端 → Render 免费 Web Service；数据库 → Neon；网页 → Vercel；App → Expo EAS |

不租用独立服务器，全部使用免费托管服务。

## 核心架构原则

这几条是贯穿整个项目的设计决策，写代码时必须遵守：

1. **本地优先，单向同步**：手机本地 SQLite 是唯一的数据录入源头。数据按用户设置的周期（7天 / 1个月）或手动点击"立即同步"，单向推送到服务器。服务器不会向手机反向推送数据（除非未来实现网页编辑功能，那是独立的后续阶段）。

2. **客户端生成 ID**：所有主表记录的 `id` 由手机端在本地创建时就生成好 UUID，Prisma schema 里不用 `@default(uuid())`。这样离线创建的记录 id 全局唯一，同步时后端可以用这个 id 做幂等去重（`skipDuplicates` 或 upsert），不怕网络重试导致重复插入。

3. **周期性交易在本地生成，不靠服务器定时任务**：App 打开时，检查每条 `RecurringTransaction` 规则的 `nextRunDate`，本地循环补生成所有到期未生成的交易（支持长期不打开 App 后的"补生成"）。

4. **预算超支判断在本地计算**：不依赖服务器实时数据，保证即使很久没同步，手机端看到的预算提醒依然是准的。

5. **后端职责单一**：只做鉴权、存储、统计聚合（`GROUP BY` / `SUM` 这类 SQL 层聚合）、给电脑端提供只读数据。不跑定时任务，不处理图片二进制数据。

6. **账户余额是衍生值，不是存储字段**：账户当前余额 = `openingBalance + 交易/转账汇总`，每次都是现算，不在数据库里存一个会被更新的 `balance` 字段，避免离线同步导致余额缓存跟实际不一致。

## 开发约定

- 每完成一个功能模块，在 `DECISIONS.md` 追加一条记录：做了什么改动 / 为什么这样设计 / 放弃了什么替代方案
- Commit message 必须说明改动原因，不只是描述改了什么（例：`改用JWT而非session，因为要支持移动端无状态认证`）
- 完整的数据库 schema、API 接口列表、认证流程、页面结构见 `docs/PROJECT-PLAN.md`——这是唯一的详细规格来源，改动数据库结构或加新功能前先更新这份文档，再动代码
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

mobile/
├── app/              # Expo Router 路由页面
├── src/
│   ├── api/          # axios实例 + 各模块请求函数
│   ├── db/            # expo-sqlite 本地数据库操作、同步逻辑
│   ├── hooks/         # React Query hooks
│   ├── store/         # zustand store
│   └── components/

web/
├── app/              # Next.js App Router 页面
├── components/
│   └── charts/
```

## 统一 API 响应格式

```json
// 成功
{ "success": true, "data": { ... }, "error": null }

// 失败
{ "success": false, "data": null, "error": { "code": "...", "message": "..." } }
```
