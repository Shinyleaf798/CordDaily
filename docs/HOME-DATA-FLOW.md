# 首页数据流：一个字符串 + 一份数据，在一行里汇合

首页 `app/(tabs)/index.tsx` 只有 20 行，但它是整个 App 里数据流最值得看的一处：
**两条互不相交的流**，一条决定"用哪套设计画"，一条决定"画什么数字"，
交点只有 `return` 里那一个三元表达式。

这份文档记的是这个结构为什么这么搭，不是接口文档——接口和 schema 看 `PROJECT-PLAN.md`。

## 全景图

```
        选哪套设计                              画什么数字
   ─────────────────────                 ─────────────────────
   用户点「我的 → 首页布局」                    SQLite (expo-sqlite)
            │                                       │
            ▼                                       ▼
   setLayoutName('ring')                  db/transactions.ts   SQL 聚合
   store/home-layout.store.ts             db/budgets.ts        SUM / GROUP BY
            │                                       │
       ┌────┴────┐                                  ▼
       ▼         ▼                        hooks/use-transactions.ts
  内存 set()  SecureStore                 hooks/use-budgets.ts
  （立即生效） （落盘，下次启动用）          └ React Query 包一层：缓存 + 失效
       │                                            │
       ▼                                            ▼
  zustand 通知订阅者                        hooks/use-home-view-data.ts
  hooks/use-home-layout.ts                 └ buildHomeViewData()  ← 唯一的计算入口
       │                                      算百分比 / 节奏 / 日均 / 按天分组
       │                                            │
       ▼                                            ▼
  layoutName: 'pace' | 'ring'               data: HomeViewData
       │                                            │
       └──────────────┬─────────────────────────────┘
                      ▼
       layoutName === 'ring' ? <RingLayout data={data}/> : <PaceLayout data={data}/>
                      │
                      ▼
            布局组件只读 data.xxx 往屏幕上画
```

`index.tsx` 全文就是三个 hook 加一个三元：

```tsx
const theme = useTheme();
const layoutName = useHomeLayout();     // 左边这条流的终点
const data = useHomeViewData();         // 右边这条流的终点
```

关键性质：**`layoutName` 不影响任何取数逻辑，`data` 也不知道自己会被谁画。**
两个布局组件的 props 签名完全一样（都是 `{ data: HomeViewData }`），所以它们是可互换的。
加第三套布局 = 新建一个组件文件 + 在 `constants/home-layout.ts` 和 `index.tsx` 各加一行，
取数那一侧一个字都不用动。

## 左边这条：布局偏好

`hooks/use-home-layout.ts` 里是一行 zustand selector：

```ts
useHomeLayoutStore((s) => s.layoutName)
```

selector 的作用是让 `HomeScreen` **只订阅 `layoutName` 这一个字段**：

- 在设置页点「金环」→ store 里 `layoutName` 变了 → selector 返回值变了 → `HomeScreen` 重渲染
  → 三元表达式换成 `RingLayout`。**整个过程不查一次数据库**，React Query 的缓存根本没被动过。
- 如果 store 里变的是别的字段（比如 `isHydrated`），selector 返回值没变，`HomeScreen` 不会重渲染。

写入是"内存先行、磁盘随后"：`set()` 是同步的，界面立刻就变；`SecureStore.setItemAsync` 是
异步的，只影响下次冷启动。用户感知不到落盘这一步。

### 冷启动为什么不会先闪一下默认布局

`app/_layout.tsx` 里有一道门：

```ts
isHydrated = isAuthHydrated && isThemeHydrated && isHomeLayoutHydrated
if (!isHydrated) return null;   // 闪屏还没关，什么都不渲染
```

三个 store 都从 SecureStore 读完了才放行。所以 `HomeScreen` 第一次渲染时，
`layoutName` 已经是用户上次选的值，不存在"先画 A 再跳成 B"。

**加任何一个需要持久化的偏好项，都要记得往这道门里加一个条件**，否则就会闪。

## 右边这条：数字

分四层，每层只干一件事：

| 层 | 文件 | 职责 |
|---|---|---|
| 存储 | expo-sqlite | 本地唯一数据源（CLAUDE.md 原则 #1） |
| 查询 | `db/transactions.ts` `db/budgets.ts` | 写 SQL，做 `SUM` / `GROUP BY` 这类聚合 |
| 缓存 | `hooks/use-transactions.ts` `hooks/use-budgets.ts` | React Query 包一层：缓存、失效、loading 状态 |
| 派生 | `hooks/use-home-view-data.ts` | 把三份原始结果算成一个 `HomeViewData` |

这里有个容易误解的点：**用 React Query 不是因为要发网络请求**。数据源就在本机 SQLite，
用它纯粹是为了拿到"缓存 + 失效"这套机制，省掉自己管一堆 `useState` + `useEffect`。

### 为什么一定要有 `buildHomeViewData`

日均消费、预算节奏（快/慢多少）、按天分组这些数，**库里一个都没有存**，全是算出来的。

如果让每套布局各算各的，早晚会出现"切到金环布局，日均变成了 113.74"这种 bug——
两处四舍五入的时机差一点就够了，而且这种 bug 没人查得出来，因为两处代码看起来都对。

所以规矩是：**`buildHomeViewData` 是唯一算"事实"的地方。**

但不是"组件里一行算术都不许写"——要分清组件里的算术是哪一种：

```tsx
// ❌ 算"事实"，必须在 buildHomeViewData 里
const dailyAverage = spent / daysElapsed;

// ✅ 算"怎么显示"，留在组件里没问题
<ThemedText>已用 {Math.round(percentage)}%</ThemedText>
<ThemedText style={{ color: dailyRemaining < 0 ? theme.expense : theme.cardHighlight }}>
```

**界线是一个问题：两套布局在这里算出不一样的结果，是 bug 还是设计选择？**

- 日均是多少 → **事实**。两套布局算出不同的值，是 bug。必须在 hook 里算一次。
- 显示成 `71%` 还是 `70.8%` → **显示形式**。两套布局精度不同，是设计选择，留在组件里。

所以 `budget-progress-card.tsx` 里那几个 `Math.round` 和颜色三元是合规的：
它们没有制造新事实，只是决定怎么把已有的事实画出来。

同样的道理，这张卡也从"自己派生"改成了"收算好的数字"——它算的 `spent / daysElapsed`
是事实，一旦它自己算，两套布局就有了两个计算源，这条规矩就破了。

### 为什么纯函数和 hook 拆成两个导出

`hooks/use-home-view-data.ts` 里导出了两个东西：

- `buildHomeViewData(input)` —— 纯函数，不碰 React，给定输入永远给出同样的输出
- `useHomeViewData()` —— 薄薄一层，负责调三个 React Query hook，把结果喂给上面那个纯函数

拆开是为了留一个可测试的入口：以后要给"预算节奏"这类规则补测试，
喂一组假的 `summary` / `budgetStatus` 给纯函数就行，不用渲染任何组件、不用起数据库。

## 反向的流：记一笔之后首页怎么更新

```
app/add.tsx → useCreateTransaction → 写 SQLite
                                        │
                                        ▼
                           invalidateAll()   把 transactions / monthSummary /
                                             budgetStatus / accountBalance 等
                                             缓存统一标记为失效
                                        │
                                        ▼
                           React Query 重跑 queryFn → 重新查库
                                        │
                                        ▼
                           useHomeViewData 拿到新数据 → 重渲染 → 布局跟着更新
```

`invalidateAll` 是一把梭而不是精确失效，这是故意的：一笔交易会同时影响账单列表、月度汇总、
标签汇总、报销清单和账户余额，**挑漏了就会出现"记了一笔但首页数字没变"**——
这种 bug 的排查成本远高于多跑几次本地 SQL 查询的成本。

布局组件在这条流里完全是被动的，它甚至不知道刚刚发生过一次写入。

## 一句话总结

- 一条流送**数据**（SQLite → SQL 聚合 → React Query 缓存 → 一次性派生）
- 一条流送**选择**（用户点击 → zustand → secure-store 持久化）
- 它们在 `index.tsx` 的三元表达式里汇合，之后的组件只负责画

要加布局，动左边；要加数字，动右边；两边互不影响——这就是这个结构存在的全部理由。

---

# 附录：`src/` 每层各管什么

上面讲的是首页这一条流怎么走。这里讲的是它路过的每一层分别负责什么——
新写一个文件不知道该放哪时，看这一节。

## 每层回答一个不同的问题

| 目录 | 回答的问题 | 判断标准 |
|---|---|---|
| `db/` | 数据在本地怎么存、怎么查 | **唯一允许出现 SQL 字符串的地方**。别处看到 `SELECT` 就是越界 |
| `api/` | 数据跟服务器怎么来回 | 发 HTTP 请求的都在这里 |
| `store/` | 跨页面共享、且要记住的**状态** | 两条同时满足：多个页面要读；不是从库里查出来的，是用户的选择或会话状态 |
| `hooks/` | 组件要用这些数据/逻辑时怎么拿 | 用到了 React 的东西（useState / useQuery / 订阅 store），且要被多个组件复用 |
| `constants/` | 写死的配置 | 纯数据，没有逻辑，跑起来之后永远不变 |
| `utils/` | 跟业务和 React 都无关的纯函数 | 输入一样输出永远一样，不碰 React 也不碰数据库 |
| `components/` | 长什么样 | 会返回 JSX |

`db/` 和 `api/` 是对称的两层：一个管本机 SQLite，一个管远程 HTTP。
按核心原则 #1（本地优先），`db/` 是主力，`api/` 目前只管认证，以后的同步逻辑会长在这里。

## 三组最容易混的边界

### `store/` 不是"存数据"的地方，数据库才是

这是最容易搞反的一条。分清楚两个词：

- **数据**（交易、分类、账户）→ 进 **SQLite**。它是事实，可能有上万条，要用 SQL 聚合，掉电不能丢。
- **状态**（当前登录的是谁、选了哪套主题、选了哪套布局）→ 进 **store**。它是一个选择，
  就一个值，没人会对它做 `GROUP BY`。

而且 **store 本身是内存，App 关掉就没了**。看 `store/home-layout.store.ts`，
它其实同时做了两件事：

```ts
set({ layoutName });                          // 内存：界面立刻变
await SecureStore.setItemAsync(KEY, layoutName); // 磁盘：下次启动还在
```

**真正"存"下来的是 SecureStore，不是 store。** store 只是内存里那份，
加上一套"什么时候写盘、启动时怎么读回来（`hydrate`）"的约定。

判断一个东西放哪，问三个问题：

```
关掉 App 再打开，它应该还在吗？
├── 不该在（输入框里没提交的草稿）      → 组件自己的 useState
└── 该在
    ├── 是事实、可能很多条、要查要算    → db/（SQLite）
    └── 只是一个选择、就一个值          → store/ + 持久化
```

### `hooks/` 是门面，不只是中转站

"用 hook 去拿数据库里的资料"——大部分时候确实是这样，`use-transactions.ts`
就是包着 `db/transactions.ts`。但 hooks 里不止这一种：

```
hooks/use-transactions.ts    中转数据库（React Query 包住 db 层）
hooks/use-theme.ts           中转 store（主题名 → 整套色板），一次数据库都不查
hooks/use-home-view-data.ts  中转 + 加工（三个查询 + 一次派生）
```

所以更准确的说法是：**hooks 是组件取用一切东西的统一门面。**
中转是它最常见的形态，不是唯一形态。

这一层的价值在于**隔离**：组件全程不知道 zustand 存在，也不知道 SQL 长什么样。
以后想把 zustand 换掉，只改 `use-theme.ts` 这一个文件，所有组件一行不用动。

### `constants/` vs `utils/`：是"数据"还是"动作"

`Colors` 是一张表 → `constants/`；`formatAmount()` 是一个动作 → `utils/`。

## 新文件放哪：从上往下问，撞到哪条停哪条

```
要写 SQL 吗？                         → db/
要发 HTTP 请求吗？                    → api/
是一张写死的表、永远不变吗？           → constants/
是纯函数，不碰 React 也不碰数据库吗？  → utils/
是跨页面共享 + 要记住的用户选择吗？     → store/
用到了 React 且要被多个组件复用吗？     → hooks/
会渲染出东西吗？                      → components/
```

**顺序不能换。** 比如 `formatAmount` 也能包成一个 hook，但它根本不需要 React——
先撞到 `utils/` 那条就该停下。能不引入 React 就不引入，纯函数永远比 hook 好测、好复用。

`components/` 内部怎么再分，见 `CLAUDE.md` 的"components/ 的两条归类规则"。
