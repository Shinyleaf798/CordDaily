# 设计决策记录

每完成一个功能模块，在这里追加一条：做了什么 / 为什么这样设计 / 放弃了什么替代方案。

---

## 2026-09-09 后端项目骨架 + 认证模块

**做了什么**

- 初始化 `backend/`：Express + Prisma + PostgreSQL(Neon)，目录结构按 CLAUDE.md 的 `routes/controllers/services/middleware/config` 分层。
- 按 `docs/PROJECT-PLAN.md` 第2节写好完整 Prisma schema（User/Category/Account/Transaction/TransactionImage/Budget/RecurringTransaction/Transfer）。
- 实现认证全流程：`POST /auth/register`、`POST /auth/login`、`POST /auth/refresh`、`GET /auth/me`，密码用 bcrypt 哈希，access token 15分钟 + refresh token 30天。
- 实现分类（`categories`）、账户（`accounts`，含 `/accounts/:id/balance`）两个完整 CRUD 模块，作为其余模块的实现模板。
- 其余模块（transactions、budgets、recurring-transactions、transfers、stats）先搭好路由骨架，返回 `501 NOT_IMPLEMENTED`，接口清单对齐 `docs/PROJECT-PLAN.md` 第4节，具体逻辑留到实现该模块时再补。
- 统一响应格式 `{ success, data, error }` 和统一错误中间件已就位，`ApiError` 贯穿所有 controller。
- 本地跑通：`/health` 返回正常，`/auth/login` 在无真实数据库连接的情况下能正确走到 Prisma 连接失败分支并被错误中间件捕获，证明路由 → 中间件 → service → Prisma → 错误处理这条链路是通的。

**为什么这样设计**

- 分类/账户先做完整实现是因为它们逻辑最简单、没有离线同步/幂等去重这类复杂性，适合作为其它模块抄的模板，同时能尽早验证整条技术栈打通。
- 账户余额端点直接实现了"衍生值现算"的核心原则（CLAUDE.md 原则#6），用 `Promise.all` 并行聚合收入/支出/转入/转出四个查询，而不是拉全部交易记录到内存里加总，减少后端计算量。
- 分类的两级限制（`parent.parentId` 不能再有值）在 service 层用一次额外查询强制校验，而不是留给前端保证，避免脏数据。
- refresh 接口只签发新的 access token，不轮换 refresh token本身——保持简单，refresh token 过期后要求重新登录即可，不需要维护 refresh token 黑名单/白名单这类额外状态。

**放弃的替代方案**

- 没有用 `express-validator`，改用 `zod`：schema 定义更贴近 TypeScript 风格，且以后类型可以直接从 zod schema 推导（虽然当前项目是 JS，先占好这个坑）。
- 没有在 Prisma schema 里给 `Transaction`/`RecurringTransaction`/`Transfer` 用 `@default(uuid())`，严格遵守 CLAUDE.md 核心原则#2——id 必须由手机端本地生成，服务器只接受、不生成。
- 没有一次性把 transactions/budgets 等模块也写完整：这些模块涉及离线同步的幂等去重、预算超支计算等更复杂的业务逻辑，先把骨架和契约（路由路径、响应格式）定下来，避免在没有手机端配合调试的情况下臆造实现细节。

---

## 2026-09-09 数据库外键加 Cascade Delete

**做了什么**

- 给 `User → Category/Account/Transaction/Budget/RecurringTransaction/Transfer` 这 6 个关系，以及 `Transaction → TransactionImage` 这 1 个关系加上 `onDelete: Cascade`
- 其余外键关系（`Category → Transaction`、`Account → Transaction/RecurringTransaction`、`RecurringTransaction → Transaction`、`Account → Transfer` 等）保持不变，维持 Prisma 默认行为
- 生成新 migration `20260909080630_add_cascade_delete` 并应用到 Neon 数据库

**为什么这样设计**

- Prisma 对外键关系不写 `onDelete` 时会用隐含默认值：必填外键默认 `Restrict`（有子记录引用就禁止删除父记录），可选外键默认 `SetNull`。这份 schema 之前一处都没配置，等于全部依赖这个隐含默认值，容易忘记、也不直观，所以明确把两类场景显式写出来。
- `User` 删除要 Cascade：以后做"注销账号"功能时，删一个 `User` 应该自动清掉这个用户名下的所有数据，不需要在 service 层手动一张张表 `deleteMany`。（之前测试时写的 `cleanup-tmp.js` 清理脚本就是因为没有 Cascade，被迫手动先删 `category`/`account` 再删 `user`，直接暴露了这个问题。）
- `Transaction → TransactionImage` 删除要 Cascade：图片是交易的附属数据，没有独立存在的意义，删除一笔交易时图片记录理应一起清掉，不应该因为还有图片记录而拦住交易删除操作。

**放弃的替代方案**

- 没有给 `Category → Transaction`、`Account → Transaction` 也加 Cascade：如果分类/账户一删就把底下的交易记录全部级联删掉，用户体验上是灾难——很容易误删几十笔账单记录且无法恢复。保留 Prisma 默认的 `Restrict`，逼前端在删除分类/账户前先引导用户处理关联的交易记录（改分类、转移账户或先删交易），这是更安全的默认行为。
- 没有给 `RecurringTransaction → Transaction` 加 Cascade：这两者本来就是可选关系（`recurringId` 可空），默认走 `SetNull`——删除一条周期规则时，已经生成的交易记录应该保留，只是不再关联那条规则，这本来就是正确行为，不需要改。

---

## 2026-09-09 升级到 Prisma 7 + 后端整体改用 ESM

**做了什么**

- `prisma`、`@prisma/client` 从 5.22.0 升级到 7.10.0（跳过 6.x），新增 `@prisma/adapter-pg` + `pg` 作为运行时连接驱动
- 新增 `backend/prisma.config.ts`：CLI（`migrate`/`generate`/`studio`）用它读取 `DATABASE_URL`，取代原来写在 `schema.prisma` 里的 `datasource.url`
- `schema.prisma` 的 `datasource` 块只保留 `provider = "postgresql"`，不再写连接串
- `src/config/prisma.js` 改用 `@prisma/adapter-pg` 的 `PrismaPg` 适配器实例化 `PrismaClient({ adapter })`，运行时连接串从这里传入，跟 CLI 那份配置分开管
- `backend/package.json` 加 `"type": "module"`，全部约 20 个源码文件（`app.js`、所有 `routes/controllers/services/middleware/config/utils`）从 CommonJS（`require`/`module.exports`）改写成 ESM（`import`/`export`），所有相对路径 import 补上显式 `.js` 后缀
- 用真实 Neon 数据库重新跑了一遍注册/登录/查用户/建账户的冒烟测试，并且顺便验证了上一条 Cascade Delete 记录：直接 `prisma.user.delete()` 不用再手动先删子表，账户记录被自动级联删除，证明数据库层面的约束改动确实生效

**为什么这样设计**

- 这次升级的直接触发点：IDE 里 Prisma 插件提示 `schema.prisma` 里 `datasource.url` "no longer supported"——这是 Prisma 7 的强制要求，不是可选项，所以决定索性升到 7 而不是留在 5.x 硬压掉这条警告。
- 生成器 provider 选了 `prisma-client-js`（旧的、但 Prisma 7 里依然可用），没有换成新的 `prisma-client` provider：新 provider 默认输出 TypeScript 源码，即便设了 `generatedFileExtension = "js"`，实测生成出来的 `.js` 文件里仍然混着 `export type X = ...` 这类 TS-only 语法，Node 直接跑会报语法错误——这是 7.10.0 这个版本这个功能还不成熟的坑，踩过之后放弃，改回成熟稳定、纯 JS 输出的旧 provider。
- ESM 迁移虽然工作量比预期大很多（原本以为只是换个配置文件，实际是 Prisma 7 要求 Client 端必须走 driver adapter，而 adapter 生态默认假设 ESM 环境），但既然要升级到 7，与其让项目同时存在"CLI 用新配置、Client 端却因为留在 CommonJS 而各种手动兼容"的别扭状态，不如一次性改干净，后端代码风格前后统一。

**放弃的替代方案**

- 没有用 `prisma@latest`（npm dist-tag 实际指向 `8.0.0-rc.13`，是个还没转正的 release candidate）——特意锁定 `prisma`、`@prisma/client`、`@prisma/adapter-pg` 都用 `7.10.0` 精确版本，避免 CLI 和 Client 版本不一致，也避免用还在候选阶段、可能有更多坑的大版本。
- 没有为了用新 `prisma-client` generator 而给项目加一层 TypeScript 构建流程（tsx/ts-node）：项目本来就是纯 JS 技术栈，为了赶新 generator 的时髦去引入编译步骤，成本和收益不成比例，等这个 generator 在未来版本稳定输出纯 JS 后再考虑切换。

---

## 2026-09-09 补完后端剩余模块：交易同步、转账、周期交易、预算、统计

**做了什么**

- `transactions`：`GET /transactions`（支持 from/to/categoryId/accountId/type 筛选）、`POST /transactions/batch`（离线同步批量推送）、`PUT/DELETE /transactions/:id`
- `transfers`：`GET /transfers`、`POST /transfers/batch`
- `recurring-transactions`：`GET/POST /recurring-transactions`、`PUT/DELETE /recurring-transactions/:id`（PUT 也用于暂停规则）
- `budgets`：`GET/POST /budgets`（POST 是 upsert）、`GET /budgets/status?month=`
- `stats`：`GET /stats/summary?month=`、`GET /stats/by-category?month=&type=`
- 新增 `src/utils/date.js` 的 `monthRange()`，被 `budget.service.js` 和 `stats.service.js` 共用（"YYYY-MM" 转成 UTC 起止区间）
- 删掉了 `src/utils/notImplemented.js`——5 个模块全部实现完，这个占位工具不再被任何路由引用
- 用真实 Neon 数据库跑了一整套端到端测试：batch 幂等重试、跨用户 id 校验拦截、账户余额随交易增删改实时变化、预算 upsert 不重复建行、budgets/status 和 stats 两个聚合接口数字对得上、删除交易级联删掉图片记录

**为什么这样设计**

- **`/transactions/batch` 的幂等去重不是直接依赖 `createMany({skipDuplicates:true})` 的返回值**，而是插入前先查一遍"这批 id 里哪些已经存在于数据库"，因为要精确知道"这次插入了哪些新记录"才能只给新交易插入图片——如果单纯信任 `skipDuplicates`，同步重试时会把已存在交易的图片再插一遍，导致图片记录重复。这是本项目"客户端生成 id + 幂等去重"这条核心原则（CLAUDE.md 原则#2）延伸到关联表（`TransactionImage`）时必须多想一步的地方。
- **`recurring-transactions` 的 `POST` 遇到重复 id 直接返回已存在的记录，而不是报错**：这条规则本身也是手机端离线生成、带客户端 UUID 的（schema 里 `id` 没有 `@default`），同步重试应该是"无痛"的，不应该让用户看到一个因为网络重试导致的失败提示。
- **`budgets` 的 `POST` 设计成 upsert（有就改、没有就建）**，没有另开一个 `PUT /budgets/:id`：因为 `docs/PROJECT-PLAN.md` 接口清单里 `budgets` 本来就只列了 GET/POST，且 schema 里 `Budget` 对 `(userId, categoryId)` 有唯一约束，前端"给某个分类设置预算"这个操作天然就是幂等的 upsert 语义，不需要额外的 id 概念。
- **`transactions/list` 和 `transfers/batch` 里都做了跨用户归属校验**（`categoryId`/`accountId`/`recurringId` 必须属于当前登录用户）：虽然多了几次查询，但这是防止恶意或写错的请求把别的用户的分类/账户 id 塞进自己的交易记录里，属于安全边界该做的最低限度校验。
- **`stats`/`budgets/status` 都不做任何写操作，纯读聚合**，符合 CLAUDE.md 原则#5"后端职责单一"——手机端自己算超支提醒，电脑端这两个接口只是把同样的聚合逻辑在服务器上跑一遍供图表展示，两边算法逻辑上是一致的（都是按分类、按月份对 `amountInBase` 求和），只是运行的地方不同。

**放弃的替代方案**

- 没有给 `budgets/status` 和 `stats/by-category` 做"父分类汇总子分类"的逻辑（比如父分类"餐饮"的预算自动包含子分类"外卖"的花费）：`docs/PROJECT-PLAN.md` 没有明确要求这个行为，贸然实现容易猜错产品需求；现在的实现是"预算/统计只认交易记录上那个精确的 `categoryId`"，后续如果确认要父子汇总，再在这两个 service 函数里加逻辑。
- 没有给 `PUT /transactions/:id` 开放修改 `images` 字段：图片的增删更适合走"新增一张图"、"删一张图"这种更细粒度的操作，塞进一个大的 PUT 里容易在"要不要先清空旧图片"这类语义上出歧义，等真的要做编辑图片这个功能时再单独设计。

---

## 2026-09-09 手机端项目骨架：导航、本地 SQLite、登录

**做了什么**

- 用 `create-expo-app@latest`（Expo SDK 57）初始化 `mobile/`，用 TypeScript（而不是纯 JS，虽然后端是纯 JS），保留了官方模板自带的主题/深色模式基础组件（`ThemedText`/`ThemedView`/`useTheme`），删掉了模板自带的演示页面和素材
- 本地 SQLite（`src/db/schema.ts` + `client.ts`）：建了 8 张表，字段基本照抄后端 Prisma schema，但去掉了 `userId`（本地设备只服务当前登录的这一个人），给需要同步的表加了 `synced` 字段
- 认证：`src/store/auth.store.ts`（zustand，token 存 `expo-secure-store`）+ `src/api/client.ts`（axios，请求拦截器自动带 token，响应拦截器在 401 时自动用 refresh token 换新重试一次）+ 真实登录页面 `src/app/login.tsx`
- 导航壳：`src/app/_layout.tsx` 用 `Stack.Protected` 做登录态路由守卫（未登录只能看到 `/login`，登录后才能看到 `(tabs)` 和 `/add`）；`(tabs)/_layout.tsx` 用 `Tabs` + 自定义 `tabBar`，做出 PROJECT-PLAN.md 里"5个按钮，中间凸起圆形＋号"的底部导航
- 完整实现"资产"这一个 tab 作为模板：本地建账户表单 + 账户列表 + 现算余额（`getAccountBalance`，算法跟后端 `account.service.js` 保持一致），用 React Query 包一层本地 SQLite 读写（不是网络请求，纯粹借它管 loading/缓存状态）
- 首页/日历/我的/添加账单 4 个页面先放占位内容，"我的"顺带做了真实的登出功能
- 用 Playwright 起了个 headless Chromium，跑通了 TypeScript 严格检查 + Metro 打包 + 真实登录接口调用（连的是本机跑着的真实后端）

**为什么这样设计**

- **手机端选 TypeScript，跟后端纯 JS 不一致**：Expo SDK 57 的默认模板已经自带 TypeScript + Expo Router，硬要拆成纯 JS 反而要跟框架默认较劲；React Native 生态的库现在基本都是 TS-first，配合类型系统学起来也更顺。
- **`app/` 放在 `src/` 下面（`src/app/`），不是项目根目录**：这是 Expo Router 官方支持的约定，SDK 57 的默认模板就是这么生成的，跟着框架默认走，回头调整了 `CLAUDE.md` 里原本写的目录结构。
- **底部导航用经典的 `Tabs`（来自 `expo-router`），没有用新的 `NativeTabs`**（`expo-router/unstable-native-tabs`，SDK 57 才有的实验性 API）：`NativeTabs` 渲染的是平台原生 tab bar，没法塞一个自定义样式的凸起圆形按钮进去；`Tabs` 支持完全自定义 `tabBar` 渲染函数，才能做出 PROJECT-PLAN.md 要求的"居中凸起圆形＋号"。中间的＋号按钮不是真正的 tab（没有对应内容要"停留"），点击后 `router.push('/add')` 跳到 tabs 外层的一个 modal 路由。
- **本地表去掉 `userId` 字段**：跟后端不同，后端一张表服务所有用户，必须用 `userId` 隔离数据；手机本地数据库只服务"当前登录的这一个人"，多存一个到处都要塞的 `userId` 字段纯粹是浪费。
- **`budgets` 本地表用 `categoryId` 当主键，不单独生成 id**：跟后端一致——`Budget.id` 是服务器自动生成的（Prisma `@default(uuid())`，不是客户端生成的），本地没法提前知道服务器会分配什么 id；而 `(userId, categoryId)` 唯一约束意味着 `categoryId` 本身就是天然的本地去重键，不需要额外造一个假 id。
- **"资产" tab 是唯一一个接了真实本地数据的页面，其它先占位**：跟后端第一轮"先做 categories/accounts 当模板"是同一个思路——账户 CRUD 逻辑最简单，没有分类两级、图片、周期规则这些复杂性，适合先跑通"页面 → hooks → db 层 → SQLite"这条完整链路，验证技术选型没问题，其它页面等这条链路稳了再复用同样的模式填。
- **`auth.store.ts` 的 `hydrate()` 加了 try/catch**：起初没加，测试时发现如果 `SecureStore` 读取失败（这次是 web 环境下 `expo-secure-store` 没实现 `getValueWithKeyAsync` 导致的已知问题），根布局的 `if (!isHydrated) return null` 会让 App 永远卡在空白页——因为失败的 promise 没人 catch，`isHydrated` 永远变不成 `true`。这不只是 web 测试环境的巧合，真机上钥匙串没初始化好、权限问题等也可能触发同样的失败模式，所以补上防御性处理：读取失败就退回"未登录"状态，而不是让整个 App 卡死。

**放弃的替代方案 / 已知限制**

- **没有让登录后的完整流程（tabs、资产页本地读写）在 Web 上跑通**：`expo-secure-store` 在 Web 平台缺失部分核心方法（`getValueWithKeyAsync`），这是 Expo 官方仓库里一个长期存在、反复被报告的已知问题，不是这个项目代码写错了。手机端从设计上就不打算支持 Web（CLAUDE.md 里电脑端是完全独立的 Next.js 项目），所以没有为了让 Web 测试通过而专门加一套"Web 环境下退化成 localStorage"的兼容代码——那是为一个根本不会上线的平台增加复杂度。已验证：TypeScript 严格检查通过、Metro 能完整打包整个路由树、登录页正确渲染、登录表单能正确把请求送到真实后端并拿到正确响应（失败点确认卡在 `SecureStore` 持久化这一步，说明网络层和表单逻辑都是对的）。真正端到端验证（登录后的 tabs、本地 SQLite 读写）需要用 Expo Go 在真机/模拟器上跑一遍，这是下一步要做的事。
- **`app.json` 的 `web.output` 从模板默认的 `"static"` 改成了 `"single"`**：`"static"` 触发的 SSR 打包流程会跟 `expo-sqlite` 的 Web Worker 实现冲突（Metro 报 `Worker chunk not found`），`"single"`（纯 SPA 模式）没有这个问题。因为这个项目根本不需要 Web 的 SEO/服务端预渲染，`"single"` 反而更贴近实际需求，不是"为了绕过 bug 将就出来的配置"。
