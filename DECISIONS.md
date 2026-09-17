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

---

## 2026-09-14 手机端三套可切换主题（白色·彩色 / 黑金 / 黑紫）

**做了什么**

- 把 `src/constants/theme.ts` 的 `Colors` 从原来的 `light`/`dark` 两键改成 `whiteColorful`/`blackGold`/`blackPurple` 三键，每套色板补了 `accentSecondary`（卡片强调色，替代之前散落各处的 `#f5a95c` 硬编码）和 `onAccent`（叠在 accent 色块上的文字/图标颜色，黑金主题下是深色，其余两套是白色，保证对比度）
- 新增 `ThemeName`/`ThemeNames`/`ThemeLabels`/`ThemeScheme` 几个辅助导出；`ThemeScheme` 单独存 light/dark，不混进色板对象里，避免污染 `ThemeColor`（`ThemedView`/`ThemedText` 的 `type`/`themeColor` prop 类型）
- 新增 `src/store/theme.store.ts`（zustand，模式抄 `auth.store.ts`）：`themeName` + `hydrate()` + `setThemeName()`，持久化用 `expo-secure-store`（跟 token 共用同一套存储，不为一个非敏感字符串单独引入 `AsyncStorage` 依赖）
- `src/hooks/use-theme.ts` 从"读系统 `useColorScheme()`"改成"读 `useThemeStore`"，返回值形状不变，绝大多数消费方（`ThemedView`/`ThemedText` 及各页面）不用改代码
- `src/app/_layout.tsx` 在原有 `useAuthStore.hydrate()` 基础上并行 `hydrate()` 主题 store，两个都完成才隐藏启动屏；`expo-router` 的 `ThemeProvider`（决定系统导航栏外观）改成看 `ThemeScheme[themeName]` 而不是系统深色模式
- 删掉了变得不再被引用的 `src/hooks/use-color-scheme.ts` 和 `.web.ts`（Expo 模板自带，改用手动主题后没人再依赖系统配色）
- 扫了一遍全仓库残留的硬编码颜色，改用主题 token：`auth-screen.styles.ts`/`login.tsx`/`register.tsx`（按钮、错误文字、切换链接文字）、`home/month-summary-card.tsx`、`home/budget-progress-card.tsx`、`custom-tab-bar.tsx`（FAB 图标）、`add-transaction/amount-keypad.tsx`（保存按钮文字）、`(tabs)/assets.tsx`（保存按钮文字）、`(tabs)/settings.tsx`（退出登录的红色）
- 在"我的"页加了一排主题选择 chip（`ThemeNames.map(...)`），点了立即生效并持久化，否则新主题系统做完也没有入口能切换

**为什么这样设计**

- 三套主题里有两套是深色、一套是浅色，没法用原来"跟随系统 light/dark 二选一"的模型表达，所以把"配色方案"从"系统深浅色"改成"用户手动选的主题名"，这是这次改动的核心，而不是简单加个新配色
- 保持 `Colors[themeName]` 的字段形状跟原来的 `Colors.light`/`Colors.dark` 完全一致（只是多了 `accentSecondary`/`onAccent` 两个新字段），是为了让 `useTheme()` 的返回值形状不变——这样绝大多数只是读 `theme.text`/`theme.accent` 的组件完全不用碰，改动面收在 `theme.ts`/`theme.store.ts`/`use-theme.ts` 三个文件，外加少数几处本来就硬编码了颜色（没走主题系统）的组件
- 新加 `onAccent` 而不是让每个用到"accent 色块上叠文字/图标"的地方各自猜一个白色/黑色：黑金主题的 accent 是偏亮的金色 `#d4af37`，白字对比度不够，需要深色文字；另外两套主题 accent 够深，白字没问题。写死在每个组件里会导致黑金主题一上线，所有"橙色按钮上叠白字"的地方全部返工
- 主题偏好持久化选了复用 `expo-secure-store` 而不是引入 `@react-native-async-storage/async-storage`：这份数据不敏感，本可以用未加密的 AsyncStorage，但项目里还没有这个依赖，为了持久化一个字符串专门加一个新的存储库不划算；`auth.store.ts` 已经证明了 SecureStore 读写的模式是稳的，直接照抄复用

**放弃的替代方案**

- 没有保留"跟随系统深色模式"作为第四个选项：三套主题都是用户主动选的品牌化配色（尤其黑金/黑紫这种强设计感的主题），跟"自动跟随系统"这种偏工具类 App 的诉求不太搭；如果以后要加，可以在 `ThemeName` 里加一个 `system` 伪主题，在 `useTheme()` 里特判去读 `useColorScheme()`，不影响现在这套结构
- 没有把 `assets.tsx` 里输入框的半透明灰色边框 (`#80808040`) 也收进主题 token：这是一个跟 accent/语义色无关的中性描边色，三套主题背景虽然不同但半透明灰在深色和浅色背景上都读得清，不属于这次"主题化"要解决的问题范围内

---

## 2026-09-15 记账表单四字段：主题 / 备注 / 店名 / 地点

**做了什么**

- `Transaction` 加 `merchant`、`location` 两列（可空），Prisma + 本地 SQLite + 后端 zod 三处同步，`docs/PROJECT-PLAN.md` 先行更新
- 抽出 `components/add-transaction/transaction-note-fields.tsx`：主题第一排（跟金额并排）、备注第二排，店名和地点并排收在 chevron 展开区里
- 店名/地点做历史补全（`suggestFieldValues`，按出现次数排序），主题/备注不做
- `db/transactions.ts` 加 `getLastCategoryForMerchant()`，为"记住上次在这家店选的分类"留好查询（尚未接到表单）

**为什么这样设计**

- **四个字段各管一个维度，不合并**：最初判断"标题"和"店名"重复、建议砍掉一个，是错的——开发者的实际用法里「标题」不是标题而是**事由**（麦当劳 / 请家人吃饭 / 3个汉堡2个薯条 / 吉隆坡机场 是四条不同的信息）。真正的问题是"标题"这个名字起错了，叫「主题」才不会被填成店名。字段命名会直接决定用户往里填什么。
- **只有店名和地点做补全**：判据是"会不会被反复输入同样的值"。麦当劳、吉隆坡机场会输入几十次；"3个汉堡2个薯条"永远只出现一次，给它补全反而碍事。
- **店名/地点反规范化存在 transactions 表上，不建 merchants 表**：建表意味着多一个同步端点 + "商家必须先于交易插入"的顺序依赖，而复用价值（输入补全、按商家统计）靠 `GROUP BY` 一条 SQL 就有。等商家自己需要属性（默认分类、logo）再拆表。
- **`title` 保持 NOT NULL，用 `主题 || 店名 || 分类名` 兜底**：主题是可选的（随手买瓶水没有"为了什么事"），但列表主行必须有东西显示。改 `title` 可空要动后端校验和所有读取方，兜底链成本低得多。
- **店名/地点默认折叠**：不是每笔消费都要记店家，常驻四个输入框会让底部面板太高，也让"随手记一笔"变得有负担。折叠后若里面已填了内容，chevron 变主题色并加一个小圆点，否则填过的东西被折叠起来就忘了。

**放弃的替代方案**

- 没有采用最初"砍掉标题、只留店名"的方案——见上，前提判断就是错的
- placeholder 里一度写了"主题，如：请家人吃饭"这样的例子提示，后来按开发者要求去掉：店名折叠后不再跟主题并排竞争，填错的风险本来就降低了

---

## 2026-09-15 打通本地保存 + 标签汇总 / 报销 / 不计入统计三个功能

**做了什么**

- `db/transactions.ts` 补完 `createTransaction` / `listRecentTransactions` / `getMonthSummary`，配 `hooks/use-transactions.ts`；`add.tsx` 的 `console.log` 换成真写入，首页月度卡片和账单列表接真实数据
- 新增 `seedDefaultCategories()`：首次启动灌 13 个默认分类，id 用 `Crypto.randomUUID()`
- `Transaction` 加 `reimbursedAt`（可空），报销从一个布尔值补成两态
- 新增两个页面：`app/tags.tsx`（标签汇总 + 标签内按分类拆分的占比条）、`app/reimbursements.tsx`（待收回总额 + 待报销/已收回切换 + 标记收回）
- 本地 SQLite 迁移改成 `PRAGMA user_version` 版本化（`db/client.ts`），`MIGRATIONS` 由一维数组改成按版本分组的二维数组
- 用 `node:sqlite` 把真实迁移语句和全部业务查询跑了一遍验证，含"老库从 v1 升到 v3"的路径

**为什么这样设计**

- **分类种子必须用真 UUID，且只能写在代码里**：后端 `transactionItemSchema` 要求 `categoryId: z.string().uuid()`，原本硬编码的 `'cat-food'` 这类 id 在本地能用（SQLite 默认不开外键检查），但**同步时整批交易会被后端打回**。而 SQL migration 语句里生成不了 UUID，所以种子只能放在 `_layout.tsx` 启动时调用，不能写成迁移。
- **本地迁移必须版本化**：原来的 `client.ts` 只跑 `CREATE TABLE IF NOT EXISTS`，没有版本概念。这次加列如果照原样写，**已经装过 App 的手机会永远停在旧表结构**，每次插入都报 `no such column: merchant`——而且只在老设备上复现。改用 Expo 官方文档的 `user_version` 模式后，v1 是冻结的初始结构，加字段只能往数组末尾追加新的 ALTER 组。
- **报销必须是两态，一个布尔值撑不起来**：只有 `isReimbursable` 的话，标记一旦打上就再也清不掉，待报销列表会越积越长直到失去意义。`reimbursedAt` 为 null 才是"待收回"。
- **勾报销时联动打开"不计入统计"，但放在 UI 层做而不是 DB 层**：这笔钱会回来，算进消费统计会让当月分类金额虚高，而且收回时记一笔收入也抵消不掉支出分类的数字。一开始把强制逻辑写在 `createTransaction()` 里，后来改掉了——那样界面会显示"不计入统计=关"但库里存的是开，**界面在撒谎**。放在 `add.tsx` 里联动，用户看得见也能再关掉。
- **三个口径故意不一致，这是设计不是 bug**：账单列表显示全部交易；月度/预算统计跳过 `excludeFromStats`；账户余额**也不看** `excludeFromStats`（钱确实出去了，余额必须真实）。验证脚本专门对这三条各写了断言。
- **标签是跟分类正交的第二个汇总维度**：一趟"日本旅行"横跨机票(交通)+拉面(餐饮)+药妆(购物)，按分类永远算不出这趟一共花了多少。所以 `tags.tsx` 的重点不是列出标签，而是展开后那张按分类拆分的明细。
- **标签汇总在 JS 侧摊平，没建 `transaction_tags` 关联表**：`tags` 存的是 JSON 字符串，SQLite 没法直接 `GROUP BY` 数组元素。本地数据量级完全够用，不值得为一个汇总页引入一张要额外同步的表。

**放弃的替代方案**

- 一度考虑把"标签"和"主题"合并（"请家人吃饭"既像主题也像标签）：两者区别是**主题每笔唯一、标签是可复用的聚合键**，前者是自由文本，后者存在的意义就是被 `GROUP BY`。等实际用一段时间后如果发现主题被反复输入相同内容，再考虑合并。
- 没有在"标记为已收回"时自动生成一笔收入交易：垫付的钱本来就没算进消费统计，再记一笔收入会让当月收入虚高。收回只是结掉这条待办。

---

## 2026-09-15 本地预算（db/budgets.ts）+ 迁移文件合并

**做了什么**

- 新增 `db/budgets.ts`（`listBudgets` / `upsertBudget` / `getBudgetStatus`）+ `hooks/use-budgets.ts` + `app/budgets.tsx`（按分类设额度，同页显示本月执行情况和超支）
- 首页预算卡从写死的 `800` 换成真实的 `useBudgetStatus()`
- 顺手把 `budget-progress-card.tsx` 残留的两处硬编码颜色（`#12b76a` / `#e5484d`）换成 `theme.income` / `theme.expense`
- 把本轮新增的两个 Prisma 迁移（`add_transaction_merchant_location`、`add_transaction_reimbursed_at`）合并成一个 `add_transaction_merchant_location_reimbursement`

**为什么这样设计**

- **总预算是各分类预算加总的衍生值，不存单独的"总预算"字段**：跟账户余额同一个道理（CLAUDE.md 原则#6）——存了就会出现"总数跟分项对不上"的经典不一致。
- **`getBudgetStatus` 的 LEFT JOIN 方向是 budgets → transactions**：这样"设了预算但本月还没花钱"的分类仍会出现在列表里（`spent = 0`）。反过来 join 的话这些分类会消失，用户会以为预算没设上。
- **预算口径的"已消费"跟月度总支出不是同一个数**：没设预算的分类不该算进预算消耗，否则预算卡永远显示超支。验证脚本对这条单独写了断言。
- **预算计算跳过 `excludeFromStats`**：垫付的钱不该占用预算额度。
- **额度填 0 直接删行**，不留一条 `amount = 0` 的记录：避免预算列表里堆一堆 0 额度的噪音行。
- **输入框用本地 draft state、失焦才写库**：每敲一个数字就写一次 SQLite 会触发 React Query 刷新，输入框会跟着抖。

**关于合并已应用的迁移（这次踩到的完整流程）**

判断能不能改迁移，只看一个问题：**它有没有跑到你控制不了的数据库上**。

- 只在自己的开发库跑过 → 随便改，最干净的做法是删目录后 `migrate reset` 重来
- 已 push、同事跑过 → 技术上能改，但要所有人 reset，通常不值得
- **已应用到生产 → 永远不要改**，只能写新迁移往前修。改了旧文件，迁移历史描述的演进路径就跟生产实际走过的路不一致，以后任何从零建的环境（CI、新同事、灾难恢复）得到的结果都跟生产不同

这次是第一种情况但要保住数据（库里有测试账号），所以走手工合并：

1. 新建合并后的目录，**沿用较早那个时间戳**（目录名时间戳决定执行顺序，用晚的会排到 `cascade_delete` 后面乱序）
2. 删掉被合并的两个目录
3. 从数据库的 `_prisma_migrations` 表删掉那两条记录
4. `prisma migrate resolve --applied <新名字>` —— 只记账不执行（列已经在库里了，真跑会报 duplicate column）
5. `prisma migrate status` 确认，输出 "Database schema is up to date!"

关键认知：**`_prisma_migrations` 不是本地文件，它是数据库里的一张普通表**，跟 `User`/`Transaction` 并排躺在 `public` schema 下。所以"迁移文件"和"迁移记录"存在两个不同的地方，合并时必须同时改，只改一边必然对不上（只删文件 → 有记录没文件；只删记录 → Prisma 以为是新迁移会去执行它）。

它存在数据库里而不是本地，是因为它记的是"**这一个特定的数据库**跑到第几步了"——同一份迁移文件在开发库/同事的库/生产库上可能各自走到不同位置，这个进度只能由数据库自己记着。

另外两条容易混的命令：`prisma migrate dev` 改数据库结构，`prisma generate` 只生成 Client 代码（`node_modules/.prisma/client`），**两者互不依赖**——只跑 generate 会出现"代码里自动补全有 `merchant`、一跑就报 column does not exist"。`migrate dev` 最后会顺手帮你跑一次 generate，所以平时容易以为是一条命令。

**放弃的替代方案**

- 没有把四个迁移全压成一个干净的 init：那需要 `migrate reset` 清空 Neon，会删掉测试账号。本轮只合并了同属一件事的那两个。
- 预算没有做父分类汇总子分类：跟后端 `budget.service.js` 保持一致（见 2026-09-09 那条记录的同名决策），`docs/PROJECT-PLAN.md` 没要求，贸然实现容易猜错需求。

---

## 2026-09-15 首页改版：预算环换成"预算 vs 时间"节奏条

**做了什么**

- 先在设计画布上出了 4 套黑金方向（现状对照 + 节奏条 / 金环主角 / 数据宫格 / 极简账本）对比，选定「方向 A · 节奏条」落地
- 新增 `utils/format.ts`：`formatAmount` / `formatCurrency` / `formatSignedAmount`，全站金额统一千分位
- 新增 `components/pace-bar.tsx`：带参考刻度的通用横向进度条（react-native-svg 画渐变）
- `budget-progress-card.tsx`：环形进度换成节奏条 + "比时间进度快/慢 X%" 的判断；日均消费/剩余每日可消费改成底部金色带的两栏
- `month-summary-card.tsx`：支出数字放大、货币符号拆成强调色小字；收入/结余改成带色点的两栏，中间一条竖分隔
- `transaction-list-item.tsx`：图标底色改用 `backgroundSelected`；支出金额不再标红
- `transaction-date-group-header.tsx`：加副标签（今天 + 具体日期），收支小计分开着色，去掉自带圆角
- `(tabs)/index.tsx`：标题栏右侧加月份 chip；左右留白 8 → 16；近7天账单从"一整块列表"改成"一天一张卡"

**为什么这样设计**

- **环形进度回答不了真正的问题**：环只说"花了 71%"。但月中花掉 60% 是超速，月末花掉 60% 是省钱——**同一个百分比，含义相反**。节奏条把预算进度和时间进度放在同一根轴上，一眼看出该不该收着点花。这也正是 CLAUDE.md 原则#4（预算判断在本地算）想保住的那个"准"：数字准没用，得让人看懂。
- **节奏判断留 3 个百分点的死区**：不留的话月初每天都在"快 1%"和"慢 1%"之间来回跳，提示天天变但没信息量，人就不看它了。
- **一天一张卡，而不是整块列表插分隔线**：原来天与天之间、交易与交易之间用的是同一种线，层级是平的。改成卡片间距分隔"天"、细线分隔"交易"，而且细线从文字开始缩进 66px（16 内距 + 38 图标 + 12 间距），不切过图标。
- **支出金额不再标红**：账本里九成以上是支出，全标红等于整屏都在报警，反而看不出哪条值得注意。红/绿留给当天小计和收入这种真正的例外。
- **图标底色从 `backgroundElement` 换成 `backgroundSelected`**：前者跟卡片同色，那个圆形底其实一直是看不见的。
- **金额格式没用 `Intl.NumberFormat`**：RN 各平台对 Intl 的支持取决于 Hermes 版本和构建时是否带 ICU，同一份代码三端结果可能不同。账本里数字对不齐很显眼，手写正则保证一致。
- **`PaceBar` 不认识"预算"**：它只知道"一个进度 + 一个参考位置"，跟 `CircularProgress` 一样是纯展示组件，之后账户额度、报销进度都能直接复用。
- **渐变用 react-native-svg 而不是 expo-linear-gradient**：项目里已经有前者（`CircularProgress` 在用），不为一条渐变多加一个依赖。SVG 下面垫了一层纯色兜底，万一某个平台上百分比宽度的 Svg 没量出尺寸，退化成纯色条而不是空条。
- **月份放在标题栏的 chip 里，不放卡片里**：它统管整屏的时间范围，写在某一张卡上会让人以为只管那张卡。

**放弃的替代方案**

- **方向 B（大金环主角）**：视觉最抓人，但首屏只放得下 3~4 条账单，而且没设预算的用户第一屏是空的，要另做兜底。
- **方向 C（数据宫格）**：信息密度最高，代价是没有主次——每个数字都一样重要就等于都不重要。
- **方向 D（极简账本，纯黑+金细线+衬线数字）**：黑金在这套里最出效果，但没有卡片边界，可点区域提示太弱；而且衬线字 iOS 是 Georgia、Android 是 Droid Serif，观感不一致。
- **月份 chip 暂时不带下拉箭头、账单标题也不带"查看全部"**：设计稿里有这两个入口，但月份切换和全部账单页都还没做。宁可先不画箭头，也不放一个点了没反应的控件。
- **没有删掉 `circular-progress.tsx`**：首页不再用它，但它是写成通用组件的，之后统计页/分类预算详情大概率还要画环。

---

## 2026-09-15 首页布局可切换（节奏条 / 金环）

**做了什么**

- 新增 `constants/home-layout.ts`（布局名 + 标签 + 说明）、`store/home-layout.store.ts`、`hooks/use-home-layout.ts`
- 新增 `components/home/home-data.ts`：`buildHomeViewData()` 把首页所有派生数字算成一个 `HomeViewData`
- 新增 `components/home/layouts/pace-layout.tsx`（A）和 `ring-layout.tsx`（B），`(tabs)/index.tsx` 缩成"取数 + 分发"
- `budget-progress-card.tsx` 改成收算好的数字，不再自己派生；`transaction-list-item.tsx` 加 `surface` 属性（行铺在卡片上还是页面底色上）
- 设置页加"首页布局"选择器，`_layout.tsx` 加一次 hydrate
- A 的月份 chip 从标题行挪到下一行，标题行右侧留给以后的搜索 / 图表入口

**为什么这样设计**

- **派生数字必须只算一次**：日均消费、预算节奏这些数库里都没有。如果每套布局各算各的，早晚出现"切到金环布局日均变了 0.01"这种没人查得出来的 bug。所以 `buildHomeViewData` 是唯一的计算入口，布局组件只负责画。这也让加第三套布局的成本变成"一个组件文件 + 两行注册"。
- **布局和配色是两个独立设置，不合并**：合并的话「极简账本」就会跟黑金绑死，用户想要"金环 + 白色主题"就没办法。代价是每套布局都必须严格只用 theme token——这条在 `constants/home-layout.ts` 的注释里写死了。
- **两个 store 拆开而不是合成一个 `preferences`**：正交的偏好项合在一起，以后加第三个只会越来越难拆。
- **布局偏好要在首屏之前 hydrate**：跟主题一样，不等它读完就渲染会先闪一下默认布局再跳成用户选的那套。
- **`surface` 属性而不是复制一个列表行组件**：两套布局的行只差图标块的形状和底色（图标块必须比它下面那层深一级才看得见），文字部分完全一样，复制一份等于以后改文案要改两处。
- **B 的预算总额从环内挪到环外**：环内直径只有 160px，四行内容会撞到环。设计稿也同步改了，稿和代码保持一致。
- **B 在没设预算时中心退回显示"本月支出"**：环本身没有意义时还显示"本月还能花 RM0.00"是在撒谎。
- **`new Date()` 移到渲染里**：原来是模块加载时取一次，App 挂后台过了零点再回来，"今天/昨天"和"这个月过了几天"都是错的。

**放弃的替代方案**

- **C（数据宫格）和 D（极简账本）没有实现**：只留在设计稿里。做四套的话每套都要跟着后面每一个新功能改，维护成本不划算——两套已经能覆盖"要细节"和"要一眼看结论"这两种用法。
- **没把布局并进现有的「主题」选择器**：那样确实少一个设置项，但布局和配色就绑死了。
- **月份 chip 没有做成可点的月份切换**：`useMonthSummary` / `useBudgetStatus` 本来就收 date 参数，做起来不难，但现在还没有月份选择器的 UI，先不放点了没反应的控件。

---

## 2026-09-15 components/ 按"谁在用"重新分层 + 首页取数包成 hook

**做了什么**

- `components/` 顶层的 9 个散文件全部归入子目录，顶层不再放文件：
  `ui/`（themed-text、themed-view、circular-progress、pace-bar）、
  `transaction/`（交易行、日期分组头）、`navigation/`（tab bar）、`auth/`（登录注册共用样式）、
  `assets/`（账户行）；`home/` 和 `add-transaction/` 原样不动
- `components/home/home-data.ts` → `hooks/use-home-view-data.ts`，同时导出纯函数
  `buildHomeViewData()` 和 hook `useHomeViewData()`；`(tabs)/index.tsx` 从 30 行缩到 20 行
- `CLAUDE.md` 目录结构更新，并写进两条归类规则
- 新增 `docs/HOME-DATA-FLOW.md`：首页两条数据流（布局偏好 / 数字）的全景图和为什么这么搭

**为什么这样设计**

- **"乱"的根源不是文件多，是顶层同时躺着四类东西**：真·基础件、通用画图件、有业务含义的
  展示件、app 骨架。四类各有各的归属规则，混在一层看起来就是随机的。所以规则定成两条：
  顶层只放目录；目录名回答"谁在用"。
- **判断一个件进 `ui/` 还是进页面目录，看它认不认识业务概念，不看现在谁在用**：
  `PaceBar` 只知道"一个进度 + 一个参考位置"，不认识"预算"，所以进 `ui/`——哪怕目前只有
  首页在用。放进 `home/` 的话，以后账户额度要画环就得 `import from '@/components/home/...'`，
  那才是真的乱。
- **`transaction/` 单独一层**：这两个件目前只有首页用，按"谁在用"该进 `home/`。但它们描述的是
  "一笔交易怎么显示"，日历页和账户详情页一定会用，放进 `home/` 会逼着日历页从 home 里 import，
  这是最典型的"目录在撒谎"。
- **`assets/` 只放一个文件也建目录**：规则一致比省一个目录重要，而且资产页肯定会长。
- **取数包成 hook 但保留纯函数**：`useHomeViewData()` 只是薄薄一层，真正算数的
  `buildHomeViewData()` 不碰 React。这样以后给"预算节奏"这类规则补测试，喂一组假数据给纯函数
  就够了，不用渲染组件、不用起数据库。
- **`home-data.ts` 从 `components/` 挪到 `hooks/`**：它是纯计算，一行 JSX 都没有，
  放在 components 下面名不副实，也不符合 CLAUDE.md 里定的目录约定。

**踩到的**

- sed 批量改 `@/` 开头的导入路径漏掉了 `account-row.tsx` 里两行**相对路径**导入
  （`./themed-text`）。`tsc --noEmit` 当场报出来了——这类纯搬家的改动，类型检查就是安全网，
  路径写错编译必然过不去。之后全仓扫了一遍，确认没有别的相对导入。

**放弃的替代方案**

- **没有按 `features/home/` 这种整块切分**：那要动 `CLAUDE.md` 里已经定好的
  api / db / hooks / store / components 五层约定，改动面远超过收益。
- **`navigation/` 和 `auth/` 没有合并成一个 `shell/`**：两者一个是导航壳一个是页面共用样式，
  合并只是为了少一个目录，反而让目录名说不清自己装的是什么。

---

## 2026-09-15 首页"还没设置预算"变成可点入口

**做了什么**

- 新增 `components/home/set-budget-link.tsx`：钱币图标 + "还没设置预算，去设一个" + 右箭头，点击跳 `/budgets`
- 布局 A 的预算卡和布局 B 的金环下方都换用它（两套布局原本都只是一行灰字，点不了）

**为什么这样设计**

- **点击是跳去 `/budgets`，不是就地弹输入框填总额**：总预算是各分类预算加总出来的衍生值
  （原则#6），数据模型里根本没有"一个总数"这个字段可以写。要设预算必须落到具体分类上，
  而那正是 `/budgets` 已经做好的事。就地弹个框填总数的话，要么得新增一个会跟分项对不上的
  缓存字段，要么得把总额按某种规则摊到各分类——两条都是在给自己挖坑。
- **抽成独立组件而不是两套布局各写一遍**："点了去哪"只写在一个文件里，以后改目的地不用两处改。
- **可点区域靠 `hitSlop` 撑到 44，不靠加 padding**：加 padding 会把卡片版式撑开，
  hitSlop 只扩大触摸范围不影响布局。

**放弃的替代方案**

- 图标没用 `pie-chart-outline`（设置页里 `/budgets` 入口用的就是这个，本来更一致）：
  用了更贴近"钱"的 `cash-outline`。Ionicons 没有真正的硬币字形，这是最接近的一个。

---

## 2026-09-15 整体月度预算：填一个总数就完事

**做了什么**

- `docs/PROJECT-PLAN.md` 先改（按 CLAUDE.md 约定）：功能清单、第2节设计取舍、第5节本地额外存储、第6节页面结构
- `db/budgets.ts` 加 `getOverallBudget` / `setOverallBudget`，存在 v1 就建好的 `app_settings` 表里
  （key `overallMonthlyBudget`），不用加迁移
- `BudgetStatus` 加 `mode: 'overall' | 'category'`，`getBudgetStatus` 优先用整体预算
- 新增 `app/set-budget.tsx`（modal）+ `useOverallBudget` / `useSetOverallBudget`
- 首页「还没设置预算」的入口从跳 `/budgets` 改成弹这个 modal
- `/budgets` 页的总额卡跟着分模式显示，整体模式下明说"分类额度暂时不生效"

**为什么这样设计**

- **两种模式，同一时刻只生效一种**：填了整体预算就以那个数为准，没填才回落到分类加总。
  不做"两个都生效取较小值"这类花样——预算提醒的价值在于一眼能信，规则一复杂就没人信了。
- **整体模式下的"已消费"必须换口径**：分类模式下 `spent` 只统计**有预算的分类**（没设预算的
  分类不该占用额度）。整体预算管的是所有花销，还沿用那个口径的话，一个分类预算都没设过的人
  会永远看到"已用 0%"——跟当初"永远显示超支"正好是同一个 bug 的反面。所以整体模式下
  `spent` = 本月全部支出（仍然跳过 `excludeFromStats`）。
- **这条不违反原则#6**：原则#6 说的是"总预算是衍生值，不存缓存字段"。衍生的是**分类模式下**
  的总额——那是加总出来的，存了就会跟分项对不上。整体模式下那个数是**用户直接给的输入**，
  不是任何东西的汇总，不存反而没地方放。两者不是同一个量。
- **存 `app_settings` 不进服务器**：它是偏好值不是账目数据；而且各分类预算本来就要同步，
  两边都存必然对不上。
- **填 0 = 清除**：跟 `upsertBudget` 同一个约定，删行回落到分类模式，不留一条 `amount = 0` 的噪音。
- **输入框用 `draft ?? 查询值` 而不是 `useEffect` 里 setState**：后者多渲染一轮，而且正是
  eslint 的 `react-hooks/set-state-in-effect` 要拦的写法（`add.tsx` 里还留着两处，待修）。

**放弃的替代方案**

- **没有按月存**（`2026-09` 对应一个数）：现在是一个"每月通用"的值，改了对所有月份生效。
  按月存要多一个维度和一套"这个月没填就沿用上个月"的规则，等真的需要再加列。
- **没有把整体预算摊到各分类**：摊法是我瞎编的，而且用户一改分类额度就会跟总数打架。

---

## 2026-09-15 删掉分类预算，只保留一个总预算

**做了什么**

- 删除 `app/budgets.tsx`（按分类设额度那一页），`_layout.tsx` 去掉对应路由
- `db/budgets.ts` 只剩 `getOverallBudget` / `setOverallBudget` / `getBudgetStatus`；
  `BudgetStatus` 简化成 `{ budgetTotal, spent }`，去掉 `mode` 和 `items`
- `hooks/use-budgets.ts` 去掉 `useBudgets` / `useUpsertBudget`
- 设置页「预算」入口改指 `/set-budget`，图标换成 `cash-outline`
- `docs/PROJECT-PLAN.md` 同步：功能清单、设计取舍、同步内容、API 表、页面结构

**为什么这样设计**

- **预算只有一个数，口径是「本月全部支出 vs 那个数」**。分类预算的颗粒度太细，录入成本高于
  它带来的信息量——要先想清楚"餐饮该给多少"才能用上这个功能，大部分人根本过不了这一关。
  一个总数是立刻能填、立刻有用的。
- **这不跟"账户余额是衍生值"（原则#6）冲突**。余额是能从流水算出来的量，存了会不一致；
  预算是用户直接给的输入，本来就没有别的地方能算出它来，不存反而没地方放。
  之前那版"总预算=各分类加总"才是衍生值，那个已经删了。
- **本地 `budgets` 表用 v4 迁移 DROP 掉**，但 v1 那组建表语句不能拿走——v1 是已发布版本，
  改它会让老设备的迁移路径跟新设备不一致：新设备走「建表 → 删表」，老设备走「建表(早就跑过) → 删表」，
  两条路径的终点必须一样（这条在 v2/v3 的注释里写过，同一个道理）。
- **后端一起清了**：删掉 `Budget` model、`budget.routes.js` / `budget.controller.js` / `budget.service.js`，
  路由注册也摘了；Prisma 迁移 `20260915152949_remove_budget_model` 已应用到 Neon。
  预算不再同步，所以服务器上留着这张表没有任何意义。

**已知代价**

- 预算存在本地 `app_settings` 里，不参与同步，所以**换手机或重装 App 会丢**。
  等做「用户设置同步」时一起解决，现在不值得为一个数单开一条同步链路。

**放弃的替代方案**

- **没有保留"两种模式并存"**：上一版做过（填了整体用整体、没填回落到加总），规则要用两句话
  才讲得清。预算提醒的价值在于一眼能信，规则一复杂就没人信了。

---

## 2026-09-17 分类图标体系、分类管理页，记账页补上日期和账户

**做了什么**

- 新建空目录 `mobile/assets/categories/`（含 README），放内置分类图标图片；
  `constants/category-icons.ts` 定义 icon 的三种写法、内置图标清单、key→图片的登记表和 `parseCategoryIcon`
- 新增 `components/category/`：`category-icon`（认三种写法的渲染件）、`category-icon-picker`（内置图库 + 表情）、
  `category-editor-dialog`（新建/编辑共用）
- 新增 `app/categories.tsx` 分类管理页：按收/支分组，改名/换图标/删除/新建；两个入口——
  记账页分类网格末位的「设置」格子，和「我的 → 分类管理」
- `db/categories.ts` 补 `updateCategory` / `deleteCategory` / `countCategoryUsage`；
  默认分类的 icon 改存 `builtin:key`，v5 迁移把老设备上已经灌进去的 emoji 就地换成引用
- 记账页补上日期和账户两个选择器（`ui/date-picker-sheet` 自画月历、`add-transaction/account-picker-sheet`），
  顺手把 `add.tsx` 里两处 `useEffect` 里 setState 的写法改掉
- `transaction-type-tabs` 从 `add-transaction/` 挪到 `transaction/`；新增 `utils/date.ts`，
  首页和日期选择器共用同一组日期函数

**为什么这样设计**

- **icon 用一个带前缀的字符串，不拆成 `iconType` + `iconValue`**：这个字段的消费方只有"渲染一个图标"
  这一个场景，没有任何查询要按类型过滤。拆成两列换来的是每张表、每个 INSERT、每个同步 payload 都多一个
  字段，收益是零。
- **内置图片走 `builtin:key` 这层间接引用，而不是直接存文件名**：存的是引用不是图片本身，
  以后换图、改文件名、甚至把 PNG 换成 SVG，都不用动数据库里的任何一行。
- **必须有一张手写的 `require` 登记表**：Metro 靠静态扫描 `require` 的字面量决定哪些资源打进包，
  `require('../../assets/categories/' + key + '.png')` 它看不见，运行时必然报错。
  所以"往文件夹里一丢就自动生效"在 RN 里做不到，登记表是这条约束的产物，不是设计上的啰嗦。
- **图片还没放进来的阶段落回每个 key 的兜底 emoji**：文件夹现在是空的，不兜底的话整个网格是一片空框。
  图标是识别分类的主要线索，宁可显示一个不那么准的符号，也不要给一个空框。
- **默认分类的 emoji 用 v5 迁移改成引用**：只改代码里的 `DEFAULT_CATEGORIES` 是不够的——
  `seedDefaultCategories` 只在空库时跑一次，已经装过 App 的设备永远轮不到它，
  那些机器上的默认分类会一直停在 emoji，以后放了图也不会显示。
- **被引用的分类删不掉，按钮直接灰掉**：后端 `Category → Transaction` 是 Prisma 默认的 Restrict
  （见 PROJECT-PLAN 的删除策略）。本地要是允许删、同步时会被服务器打回，
  用户看到的是"删掉的分类又回来了"这种没法解释的现象，所以本地用同一条规则挡在前面。
  灰按钮 + 一行"N 笔记录在用"，比让用户点了才知道不行要好。
- **「设置」固定在分类网格最后一格**：想改分类的念头几乎只在"扫了一遍网格没找到合适的"时冒出来，
  那一刻视线正停在网格末尾，入口就该在那里，而不是页面右上角。
- **新增 `ui/modal-host`，弹层不再一律开路由**：判断标准是这一层**有没有自己的地址**。
  选日期、选账户、选图标都是"挑一个东西还给调用方"，走路由就得为一次性的选择结果多建一个 store，
  或者把值塞进 URL 参数再解析回来——都是为了绕开"组件之间传个值"这件本来很简单的事。
  用 RN 的 `Modal` 而不是绝对定位的 View，是因为它是系统级窗口，能盖住原生 header 和底部 tab bar。
- **月历自己画，不用 `@react-native-community/datetimepicker`**：那是系统原生控件，
  两端长得完全不一样，也不吃这个 App 的色板——在一屏自定义配色里弹出一个系统灰的转轮像走错了 App。
  而记账要的只是"从最近几天里挑一天"，用不上时区、时间、范围这些原生能力。
- **日期选择器只给"哪一天"，时间点由 `add.tsx` 的 `composeDate` 补**：选今天就存此刻，
  选别的日子就把当前钟点搬过去。固定补 12:00 也行，但那样同一天补记的几笔时间完全相同，
  账单列表排不出稳定的先后顺序。
- **`transaction-type-tabs` 挪到 `transaction/`**：分类管理页也要用同一个控件，
  留在 `add-transaction/` 会逼着它从记账页的目录里 import 一个跟记账无关的东西（同 CLAUDE.md 的归类规则）。

**放弃的替代方案**

- **没做"从相册上传分类图标"**：要引入 `expo-image-picker` 和一套本地文件生命周期
  （复制进沙盒、删分类时清理、同步时上传），等接 Cloudinary 直传时一起做更省事。
  渲染层已经认得 `file://`，到时候只要在 icon picker 里多加一个入口。
- **没做子分类的增删改**：`parentId` 列一直在，但目前全 App 都按一级分类用。
  两级分类要先回答"选子分类时父分类怎么展开""统计按哪一级汇总"这些问题，不是加一个字段就完事。
- **删除没做成软删除**：分类没有历史价值，留一条 `deletedAt` 只会让每个查询都要记得过滤它。

---

## 2026-09-17 首次启动灌一个默认账户「现金」

**做了什么**

- `db/accounts.ts` 加 `seedDefaultAccount()`，`_layout.tsx` 跟 `seedDefaultCategories()` 一起调
- 空库才跑：已经有账户的设备直接返回，不会凭空多出一个「现金」

**为什么这样设计**

- **这是在补一个一直存在的洞**：`transactions.accountId` 是 NOT NULL，没有账户就一笔账都记不了。
  全新安装的 App 打开后保存按钮永远是灰的，界面也没地方解释为什么——
  记账页默认取 `accounts[0]` 的写法把这个洞盖住了，从来没人碰到过是因为开发机上早就手动建过账户。
- **只灌一个，不灌「现金 / 银行卡 / 电子钱包」三个**：灌三个等于每笔账都要**做一次选择**。
  账户对不关心它的人应该是完全隐形的：一个默认值一直在，chip 上写着「现金」，永远不用点开。
  真要分账户的人自己去资产页加，那时候他清楚自己要什么。
- **没有把 `accountId` 改成可空**：那要动本地表、Prisma schema、后端校验和每一条聚合查询，
  还多出"没有账户的交易"这个新状态，所有统计都得想清楚怎么对待它。灌一行数据便宜得多。
- **`openingBalance` 给 0**：一上来就逼用户盘点钱包里有多少现金，是在记账之前先设一道门槛。
  余额本来就是衍生值，想要准的人随时可以回资产页改期初。

**顺带记一笔：账户这个概念现在的处境**

盘过一遍——余额没有任何地方在用（首页不显示，预算口径完全不碰账户）；`transfers` 表只有 db 层认识，
一个界面都没有；资产页 143 行干的事是"列出账户 + 新建账户"，也就是它存在的唯一目的是让记账页那个
必填字段有值可填，属于自我循环。

**结论是留模型、砍存在感**，不是删表：拆的代价（Prisma 迁移、删 transfers、去掉 NOT NULL 外键）
远大于留的代价，而且以后想加回来更贵——历史交易得回填 `accountId`，那时已经不记得哪笔是现金哪笔是卡了。
对账（"这个月信用卡刷了多少，跟账单对不对得上"）是迟早会来的真实需求，
「余额是衍生值」（核心原则#6）也是这个项目里最值得讲的设计之一。

**待定**：资产 tab 是否从底部五格里降级挪进「我的」，把那一格让给日历或统计。单独决定，这次没动。

---

## 2026-09-17 记账保存不再静默失败，保存后回首页

**做了什么**

- 保存键为什么是灰的，界面上直接说出来（`blocker`：先选分类 / 先选账户 / 金额还是 0）
- `createTransaction` 补上错误显示，失败时**留在原地**不跳转
- `router.back()` 改成 `router.dismissTo('/')`

**为什么这样设计**

- **起因是一个查了半天的"点保存没反应"**：库里一个账户都没有时 `accountId` 恒为 `null`，
  `canSave` 为假，保存键是个 opacity 0.5 的死按钮——不跳转、不报错、什么都不发生。
  用户唯一能得到的信息是"按钮好像坏了"，而真正的原因（还没有账户）界面从头到尾没提过。
  **一个禁用的按钮必须说明它为什么禁用**，否则它和一个坏掉的按钮在用户眼里没有区别。
- **一次只报一条待办**：三条一起列出来，人不知道该先干哪个，反而比一条更难动。
- **失败不跳转、不清空**：记账这件事一旦让人以为记上了，就不会有第二次。
  跳转本身就是一种"成功了"的信号，所以它必须只在真成功时发生。这跟 `3f14b1b`
  修预算保存那处是同一类错误，当时漏了记账这条路径。
- **保存后回首页而不是 back**：＋号是全局动作，不属于任何一个 tab。从资产页按的＋，
  `back` 会把人送回资产页，那笔刚记的账落在哪儿完全看不见。
  `dismissTo` 一路关到首页；首页不在历史里时退化成 `replace`，两条路径都落在首页。

**没有改的**

- **首页只显示近7天，补记的旧账不出现在那里**——这是设计不是 bug，那张卡本来就叫「近7天账单」。
  等日历页做起来，那才是看旧账的地方。

---

## 2026-09-17 账单详情层（编辑 / 复制 / 删除），记账页改成左右滑转场

**做了什么**

- `components/transaction/transaction-detail-sheet.tsx`：点首页任意一笔账单弹出的底部详情层，
  上半部分是这笔账的全貌，底部一行三个动作
- `db/transactions.ts` 补 `getTransaction` / `updateTransaction` / `duplicateTransaction` / `deleteTransaction`，
  配套四个 hook
- 记账页拆成两层：`app/add.tsx` 只负责"要编辑的那笔查出来没有"，
  表单本体搬进 `components/add-transaction/transaction-form.tsx`，新建和编辑共用
- 新增 `components/home/layouts/types.ts`，把两套首页布局的 props 契约收拢成一个类型
- 记账页转场从 `fullScreenModal` 换成 `push`（从右滑入，返回原路滑回右边）

**为什么这样设计**

- **详情是底部弹层，不是整页**：看一笔账是"瞄一眼确认是不是这笔"，不是一次阅读。
  盖掉整屏会让人失去"我刚才在列表的哪个位置"的感觉，回来还得重新找。
- **删除确认不套第二层 Modal，而是在同一个 ModalHost 里换内容**：
  原生 Modal 套原生 Modal 在 iOS 上会出现里层关掉外层跟着闪一下的毛病；
  而且从体验上讲"确认删除"本来就该接管这一层，不是在它上面再叠一层。
- **编辑跳转前先关弹层**：原生 Modal 还开着就导航的话，它会浮在新页面上面盖住记账表单。
- **复制出来的那笔日期落在此刻，不抄原来那天**：复制的用途是"今天又买了一样的东西"。
  照搬旧日期的话，复制一笔三周前的账，首页（只看近7天）什么都不会发生，
  用户只会以为按钮坏了——跟上一条修掉的"点了没反应"是同一种伤害。
  `reimbursedAt` 同理不抄：旧的那笔钱收回来了，新的这笔还没有。
- **记账页拆成"取数壳 + 表单"**：编辑要用查出来的那笔当十几个字段的初始值。
  壳等数据到齐了才挂载表单，表单就能直接拿 props 当 `useState` 初始值——
  用 `useEffect` 往 state 里同步会先渲染一轮空表单再跳成有值的，编辑时肉眼能看见闪一下。
- **弹层由首页持有，不放进布局组件**：两套布局点同一行应该弹出同一个东西，
  放进布局里就变成两份要同步维护的实现。布局只负责把"哪一行被点了"报上去。
- **转场换成左右滑**：记一笔是一条"进去做完事再出来"的流程，不是一个需要强调"你正被打断"的弹窗。
  另外 `presentation: 'modal'` 会接管转场，`animation` 那一栏写什么都不生效——
  想要左右滑就必须离开 modal。返回动画不用单独配，`slide_from_right` 的出场就是它的逆过程。
- **不可点的列表行退回 `View`，而不是给 `Pressable` 传 `disabled`**：
  disabled 的 Pressable 仍然会吃掉触摸事件，外面包着的滚动区域会跟着变迟钝。

**已知代价**

- **删除是真删行，没有墓碑**。这笔要是已经同步到服务器了，本地删掉、服务器上那份还在——
  单向同步没有"删除"这个动作。等做同步时要补一张墓碑表（记下被删的 id 推给服务器）。
  现在服务器上一条数据都没有，为一个还不存在的问题先建表不划算，但**别忘了这条**。
- **编辑时主题字段回填的是 `title`**，而 `title` 可能当初是从店名或分类名兜底来的，
  回填后看着像是用户填过主题。库里只存了这一个字符串，分不出它当初的来源。

---

## 2026-09-17 日期选择器加时分，详情层的日期写全，三个动作做成分段控件

**做了什么**

- `ui/date-picker-sheet` → `ui/datetime-picker-sheet`：加小时/分钟两条横向数字带，
  收在左下角一个 chip 里默认不展开，右下角是「确定」
- 选择器从"点一天就关"改成"改草稿 + 按确定生效"
- 详情弹层的日期改成完整写法：`昨天 9月16号 16:00`（`utils/date.ts` 的 `formatDateTimeLabel`）
- 详情弹层底部三个动作做成一条分段控件，轨道用 `tabTrackBackground` 跟账单信息拉开色差
- 删掉 `transaction-form` 里的 `composeDate`——选择器现在连时分一起给回来，不用再补时间点

**为什么这样设计**

- **加了时间就必须改成「草稿 + 确定」**。点一天立刻关闭的话，根本没机会再调时分；
  而"先调时间再点日子"这种隐含的操作顺序没人猜得到。现在整个弹层只改一个草稿值，
  先点哪个都一样。代价是常用路径多一次点击，换来的是不存在"顺序错了就白调"这种坑。
- **时间默认收起来**。绝大多数记账就是"刚刚"，时分是少数情况才要改的；
  两条数字带常驻会把日历挤下去。默认值取当前时刻，不展开也永远是对的。
- **分钟给满 60 个，不做每 5 分钟一跳**。横着滚一条数字带，60 个和 12 个的操作成本差不多，
  但少了"我那笔是 16:07，只能选 16:05"的将就。打开时用 `contentOffset` 直接跳到选中项。
- **日历和时间带包进 ScrollView，底部那行留在外面**。`ModalSheet` 只是 `maxHeight`，
  超出部分直接裁掉——小屏上时间带一展开，被裁掉的恰好是最下面的「确定」，
  那就又造出一个"点了没反应"的按钮，跟刚修完的那个一模一样。
- **详情里日期要三样全给**：只说"昨天"答不出几点，只说"9月16号"答不出那是前天还是上周。
  相对词负责快速定位，绝对日期 + 时刻负责说准。列表里一行位置不够，那边继续用简写。
- **三个动作做成分段控件**：轨道色 `tabTrackBackground` 比弹层底色 `backgroundElement` 深一级，
  这一组按钮因此是"浮"在账单信息上面的，不会被当成详情的又一行。
  编辑给强调色实底（它是最常用的那个），复制和删除用普通底色，靠字色分开。
- **删除不用红底白字**：三套主题的 `expense` 里有两个是浅红（`#f97066`），白字压不住，
  对比度不够。红字配普通底色一样刺眼，还没有可读性问题。

**留了一处不一致**

详情弹层写「9月16**号**」，首页账单列表的分组标题写「9月16**日**」。
前者是这次明确要的格式，后者没动。要统一的话改 `utils/date.ts` 一处就行。

---

## 2026-09-17 页面的"底线外观"写在路由层，不写在组件里

**做了什么**

- 日期写法统一成「日」：`formatDateTimeLabel` 改成调用 `formatMonthDay`，
  全 App 的「几月几日」只剩一处定义
- `_layout.tsx` 给 `add` / `categories` 补上 `title` 和 `contentStyle` 的底色
- `TransactionForm` 最外层自己铺 `theme.background`
- 删掉 `categories.tsx` 里那个跟路由层重复的 `headerTitle`

**为什么这样设计**

起因是一个现象：进记账页点左上角 X 关闭时，会闪一下**白底、标题写着 "Add"** 的空屏。
拆开看是两件事凑在一起：

- **标题退回路由名**：`add` 这个路由在 `_layout.tsx` 里只配了 `animation`，没配 `title`。
  真正的标题（收支切换 tabs）是 `TransactionForm` 内部用 `<Stack.Screen options>` 设的——
  **那份 options 跟着组件走**，组件不在的那几帧（转场中、编辑模式还在查数据），
  标题就退回默认的路由名 "Add"。
- **底色退回导航器的白**：表单最外层是 `<SafeAreaView style={{ flex: 1 }}>`，没有底色。
  页面底色一直是 react-navigation 的 `DefaultTheme.colors.background`。
  平时看不出来，是因为白色主题的 `background` 是 `#F0F0F3`，跟它几乎一样——
  这其实是个一直存在的隐患：黑色主题下这个页面的底色也不归主题管。

所以规矩是：**一个页面的"底线外观"（标题、底色）写在路由那一层，组件里那份只加它额外要的东西。**
组件里的 `<Stack.Screen options>` 天然是有条件的（组件挂载了才算数），
拿它兜底等于假设"组件永远在"，而转场和异步取数这两种情况下它就是不在。

**补：光有 title 和 contentStyle 还不够，导航器的主题色才是根**

第一版只补了 `title` 和 `contentStyle`，截图回来发现标题对了、**底色还是纯白**。
关键线索是那个白：黑金主题的 `background` 是 `#000000`，连 react-navigation 自带 `DarkTheme`
的背景也是接近黑的 `rgb(1,1,1)`——**纯白不是任何一套主题的颜色**，那是 Android 原生窗口底色，
说明那一层压根没有任何背景在画。

`contentStyle` 兜不住的原因：它套在包着 children 的那层容器上（见 react-native-screens 的
`ScreenStackItem`），children 一个都不剩时那层容器塌成 0 高度，什么也不画。

真正的根是：**导航器自己的一套颜色从来没跟 App 的三套色板接上**。
屏幕底色、header 底色、返回箭头、标题文字全归它管，而它默认只有 light/dark 两档现成色板。
所以改成用 App 色板拼一个 navigationTheme 喂给 `ThemeProvider`：
屏幕底色画在原生 Screen 这一层，内容一个都不剩时也还在。
顺带修掉一个一直没人提的问题——header 的灰跟卡片的灰本来就不是同一个灰。

两层都铺：navigationTheme 管原生 Screen 那一层，contentStyle 管 children 外面那层。

**没有做的**

没有去追"为什么那几帧里表单不在"。原生栈 pop 时的挂载时机是 react-native-screens 的行为，
改不动也不该改。把那一帧修得跟正常状态一样，比让它不出现更实在。

## 2026-09-17 从原生栈换到 JS 栈（expo-router/js-stack）

**改了什么**

- `mobile/src/app/_layout.tsx`：`<Stack>` 的来源从 `expo-router` 换成 `expo-router/js-stack`。
  没有装新依赖——expo-router 57 自己就带着一份 vendored 的 `@react-navigation/stack`，
  并且把它作为公开入口导出（内部那份 `createStackNavigator` 的注释原话是
  "App code should use `Stack` from `expo-router/js-stack`"）。
- `mobile/src/constants/screen-transitions.ts`：预设值几乎原样保留（JS 栈认识同一批
  `animation` 名字和 `presentation: 'transparentModal'`），改的是类型收口：
  从一堆 `as const` 换成 `satisfies Record<string, StackNavigationOptions>`，
  写错选项名编译期就报。
- 三个用 `<Stack.Screen options>` 设 header 的地方（`tags`、`reimbursements`、
  `transaction-form`）改成从 `expo-router/js-stack` import，拿到的才是 JS 栈的 options 类型。
- 删掉两处 `contentStyle: { backgroundColor: theme.background }`：那是原生栈的选项名，
  JS 栈对应的是 `cardStyle`；但这里连 `cardStyle` 都不用写，因为卡片底色本来就取
  `navigationTheme.colors.background`（见 vendored 的 `views/Stack/CardContainer.js`
  那行 `presentation === 'transparentModal' ? 'transparent' : colors.background`），
  上一条决策里接上的那个 navigationTheme 已经把它管住了。

**为什么这样设计**

直接起因是想要自己写转场动画。但真正非换不可的，是原生栈上一个改不掉的现象：
**页面关闭时内容先被清空、再滑走**——看到的是一块纯色面板带着 header 滑出去。

根因查到底了，在 expo-router 内部这份 native stack 的 view 里
（`react-navigation/native-stack/views/NativeStackView.js:53-54`）：

```js
state.routes.concat(...).map((route, i) => { const isFocused = state.index === i; ... })
```

pop 的一瞬间，被关闭的那条路由**当场从 `state.routes` 里消失**，React 立刻卸载整棵子树，
而原生层这时才开始播关闭动画——滑走的必然是空壳。

JS 栈没有这个问题，因为它不信任 `state.routes` 就是"该画什么"：
`views/Stack/CardStack.js` 里维护了一个 `closingRouteKeys`，被关掉的路由留在它自己的局部
state 里，**动画播完才真正移除**。同一件事，一个交给原生去播、React 侧提前撒手，
另一个自己从头管到尾，所以只有后者能让内容跟着一起滑。

换栈顺带解决了动画这一半：`animation` 现在只是 `cardStyleInterpolator + transitionSpec`
的一个快捷名字，想自定义就直接写那两个，都从 `expo-router/js-stack` 导出。
另外 `slide_from_right` 在 JS 栈上两端都真的是"从右滑"，不像原生栈在 Android 上会回落成平台默认。

**放弃了什么替代方案**

- **改 `animation` 参数**：无关。滑动本身一直是好的（进场时首页完整跟着平移），坏的是内容存在与否。
- **`NativeStackView.js` 第 88 行那个 `display: 'none'`**：那行管的是**下层**屏幕。
  pop 时被关闭的路由根本没进那个 `.map()`，轮不到它生效。
- **用 `contentStyle` 铺底色兜住**：那层 View 跟着一起被卸载，兜不住。
  （这条上一次已经踩过一遍，见上一节。）
- **升级 expo-router**：57.0.21 里那段代码逐字节相同，升级不解决。
- **`usePreventRemove` 拦住 GO_BACK**：实测**能**拦住、内容也确实保持挂载，
  但要配 `presentation: 'transparentModal'` + 自绘动画 + 手搓侧滑手势，
  而且那条路自己也得关掉原生动画（`animation: 'none'`）——
  **等于同样是 JS 动画，却多付了内部 API 和手搓手势的代价**。这是选 JS 栈而不是它的决定性理由。

**已知代价（接受）**

动画由 JS/Animated 驱动而不是原生线程；header 从原生控件换成
`@react-navigation/elements` 渲染——这个项目的 header 本来就全是自定义的
（收支 tabs + X），不受影响。

**保留没动的**

上一条决策里加的 navigationTheme（用 App 色板拼的导航器主题）和
`SystemUI.setBackgroundColorAsync(theme.background)` 都留着：前者现在是每张卡片的底色，
后者管的是启动图收掉到首屏之间那几帧、以及透明屏底下真的什么都没有的时候。
