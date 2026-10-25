# CordDaily

本地优先的个人记账 App：手机本地 SQLite 是唯一的数据源头，不登录也能记账，云端只是一条可选的备份通道。

更详细的项目介绍和截图：https://shinyleaf798.github.io/my-portfolio/projects/corddaily

## 仓库里有什么

| 目录 | 是什么 | 状态 |
|---|---|---|
| `mobile/` | React Native + Expo（SDK 57）App，项目的主体 | 在用 |
| `backend/` | Express + Prisma，一套云端实现（JWT 鉴权 + 同步接口 + 统计聚合） | 在用，但不是默认通道（见下） |
| `docs/` | 规格文档、学习笔记、首页数据流图解 | — |
| `web/` | 电脑端只读看账 + 图表（Next.js） | 还没开始 |

**云端有两条通道**，App 按「用户有没有自己填 Neon 连接串」自动挑（`mobile/src/api/cloud-transport.ts`）：

- 填了 → 手机**直连用户自己的 Neon**，App 自己建表，不经过任何服务器
- 没填 → 打 `backend/`，走注册登录那套

发布版走的是第一条（我拿不到任何人的财务数据）。`backend/` 留着是因为电脑端只读网页以后要走它，
而且那套 Prisma schema 是远端建表 DDL 的对照基准——两边表名列名必须逐字一样。

## 跑起来

### 一条命令同时跑 backend + mobile

```bash
npm install   # 第一次运行需要，装的是根目录的 concurrently
npm run dev
```

这只是把下面两条命令用 [concurrently](https://www.npmjs.com/package/concurrently) 包在一起跑，
两个进程本身各自独立（backend 连 Neon 云数据库，跟 mobile 没有编排依赖），
日志用颜色区分 `backend`/`mobile` 前缀，Ctrl+C 同时停掉两个。

想分开控制（比如只重启其中一个），按下面两节分别单独跑。

### 1. Backend

```bash
cd backend
npm install
npm run dev        # nodemon，监听 3000 端口，改代码自动重启
```

首次运行前把 `backend/.env.example` 复制成 `backend/.env`，填好 `DATABASE_URL`（Neon 连接串）
和两个 JWT secret。

**只做手机端功能的话这一步可以整个跳过**——记账、统计、导出、从文件恢复都不碰网络。

### 2. Mobile

```bash
cd mobile
npm install
npx expo start     # 终端打印二维码，用 Expo Go 扫码在真机上打开
```

**真机联调、且要测走 backend 那条云端通道时必看**：`mobile/.env` 里的 `EXPO_PUBLIC_API_BASE_URL`
必须指向你电脑的**局域网 IP**（例如 `http://192.168.1.10:3000`），不能是 `localhost`——
手机和电脑是两台设备，手机上的 `localhost` 指向手机自己。查局域网 IP：

```bash
ipconfig        # Windows，找 IPv4 Address
ifconfig        # macOS/Linux
```

换了 Wi-Fi 之后这个 IP 通常会变，要重新改一次。只用 `expo start --web` 在电脑上跑网页版时
`localhost` 才是对的；测 Neon 直连那条通道时这个变量完全用不到。

### 常见问题

- **backend 报 `EADDRINUSE: address already in use :::3000`**：已经有一个 backend 进程在跑了
  （比如上次没关掉），不是端口冲突，找到关掉那个旧进程即可。
- **手机上登录/注册一直失败**：先确认 backend 在跑（`npm run dev` 有没有报错），
  再检查 `mobile/.env` 的 IP 是不是当前网络下电脑的局域网 IP。
- **「备份到云端」报连不上**：先分清走的是哪条通道——「我的 → 云端」里填过连接串就是直连 Neon，
  这时跟 backend 和 `EXPO_PUBLIC_API_BASE_URL` 都无关。

## 代码在哪

```
mobile/src/
├── app/            # Expo Router 路由页面，文件名即路由；(tabs)/ 是底部四个 tab
├── db/             # 本地 SQLite 的全部读写 + 备份/同步逻辑；neon/ 是远端那份建表和会话
├── api/            # axios 实例 + 云端通道（cloud-transport 选实现，sync/neon-transport 是两个实现）
├── hooks/          # React Query hooks + 页面级取数 hook（use-home-view-data 这类）
├── store/          # zustand：登录态、首页布局、主题
├── constants/      # 主题色板、内置分类（含写死的 UUID）、币种、布局清单
├── utils/          # 纯函数（金额/日期格式化）
└── components/     # 见下面的归类规则

backend/src/
├── routes/         # URL 路径 → controller
├── controllers/    # 解析参数、调 service、套统一响应格式
├── services/       # 业务逻辑（统计聚合、同步去重）
├── middleware/     # auth（JWT 校验）、error（统一错误格式）
└── app.js
```

`components/` 的两条归类规则（新增组件前先过一遍）：

1. **顶层不放散文件，只放目录**。看到 `components/` 底下直接躺着一个 `.tsx`，就是还没归好类。
2. **目录名回答「谁在用」**：只有一个页面用 → 放那个页面的目录（`home/`、`stats/`…）；
   跨页面用 → 按领域分（`transaction/`、`category/`…）。判断该进 `ui/` 还是某个页面目录，
   看它**认不认识业务概念**——`PaceBar` 只知道「一个进度 + 一个参考位置」，不认识「预算」，
   所以进 `ui/`，哪怕目前只有首页在用；`transaction-list-item` 认识「收入/支出」，
   放进 `home/` 会逼着日历页从 home 里 import，所以进 `transaction/`。

## 改代码前要知道的约束

这几条不是风格偏好，是会在别处炸的硬约束：

1. **同步是单向的**。本地往云端推，云端只在一种情况下往手机送数据：重装后本地库是空的、
   且用户明确点了「恢复」。不要加「从云端拉下来合并进有数据的库」——那要配套冲突解决、
   删除墓碑、版本向量，是另一个子系统。（分类和账户是例外，它们做了三方合并，见 DECISIONS 9-29。）
2. **id 由客户端生成**。所有主表记录创建时在手机上生成 UUID，Prisma schema 里不要加
   `@default(uuid())`——离线创建的记录要全局唯一，同步重试才能靠 id 幂等去重。
3. **内置分类的 UUID 是写死的常量**（`constants/default-categories.ts`，22 个一级 + 14 个二级），
   每台设备一样，所以恢复时备份包里的 `categoryId` 不用改写。代价：这批 id 在所有用户间共享，
   因此服务器上 `Category` / `Account` 的主键是 `@@id([userId, id])` 复合键。**不要删 `userId` 列**，
   哪怕一个库只有一个账本时它看着像废列——改主键的迁移要跑在陌生人的数据库上。
4. **导出文件和云端 bundle 是同一个 JSON 结构**，所以恢复只有一套代码（`planImport` / `applyImport`）。
   备份包必须自解释：交易里出现的任何 id，同一份包里都要找得到，所以分类和账户是必需组成部分。
5. **账户是纯标签，手机端不显示余额**。它只回答「这笔账我用什么付的」，没有转账、没有对账。
   `accounts` 表上 `openingBalance` 和 `type` 两列留着不用（删列要整表重建），
   后端那套余额计算也留着给以后的电脑端。真要算余额，是 `openingBalance` + 交易汇总**现算**，
   永远不要在库里存一个会被更新的 `balance` 字段——离线同步一定会让它跟实际对不上。
6. **周期性交易和预算超支都在本地算**。App 打开时按 `nextRunDate` 本地补生成到期的交易
   （支持长期没打开过的补生成）；预算提醒不依赖服务器，很久没同步也得是准的。后端不跑定时任务。
7. **远端表结构逐字对齐 Prisma**。表名 `"Transaction"` 不是 `transactions`，列名 camelCase，
   `DECIMAL(65,30)`。偏离一个字母，「同一个库既能被手机直连写、也能被后端读」这条路就断了。

## 打包 Android

`mobile/android/` 是 `expo prebuild` 生成的，在 .gitignore 里。构建期的约定都写成了 config plugin
（`mobile/plugins/with-release-signing.js`）——**手改 `android/` 下的文件会被下次 prebuild 悄悄抹掉。**

```bash
# 正式包（签名 + ARM-only），产物在 android/app/build/outputs/apk/release/app-release.apk
cd mobile/android && JAVA_HOME="<Android Studio>/jbr" ./gradlew.bat assembleRelease

# 装模拟器（模拟器是 x86_64，正式包装不进去）
cd mobile/android && JAVA_HOME="<Android Studio>/jbr" ./gradlew.bat assembleDebug -PreactNativeArchitectures=x86_64
```

四条容易踩的：

- **不要手动加 x86 架构**。插件把 `reactNativeArchitectures` 锁成 `armeabi-v7a,arm64-v8a`。
  默认那四套里 x86/x86_64 占约 50 MB，而**只有模拟器用得上**——市面上没有 x86 的 Android 手机。
  剔掉之后整包从约 116 MB 降到约 67 MB。
- **JDK 必须 17+**。这台机器 PATH 上第一个 `java` 是 Java 8，RN 0.86 跑不了，
  所以每条命令都要显式指 `JAVA_HOME` 到 Android Studio 自带的 JBR（本机：`G:\Programming\Android Studio\jbr`）。
- **改了图标、启动图、app.json 才需要 prebuild**，改 JS/TS 不用——打包时会重新 bundle。
  注意 `prebuild` 即使不加 `--clean` 也会清掉 `android/`，等于每次都是完整构建。
- **签名证书在 `mobile/credentials/*.jks`，四个密码在 `~/.gradle/gradle.properties`**，两样都不进 git。
  没配凭证时 release 会**静默退回 debug 证书**（见插件注释）——发版前用
  `apksigner verify --print-certs` 确认 DN 是 `CN=CordDaily`。

## 文档去哪儿看

| 文件 | 什么时候看 |
|---|---|
| [docs/PROJECT-PLAN.md](docs/PROJECT-PLAN.md) | 要加功能或改需求。功能清单、8 张表存什么、接口列表、页面结构。**先改这份，再动代码** |
| `backend/prisma/schema.prisma` | 字段的精确定义（类型、默认值、关系）以这份为准，PROJECT-PLAN 只用大白话说 |
| [DECISIONS.md](DECISIONS.md) | 「这里为什么写成这样」。按时间倒着记，每条是「改了什么 / 为什么 / 放弃了什么替代方案」 |
| [docs/NOTES.md](docs/NOTES.md) | 踩坑笔记，按知识点排。每条四段：现象 → 原因 → 解法 → 能带走的规矩 |
| [docs/HOME-DATA-FLOW.md](docs/HOME-DATA-FLOW.md) | 首页那两条互不相干的数据流（选哪套布局 / 画什么数字）怎么在最后一行汇合 |
| [CLAUDE.md](CLAUDE.md) | 给 AI 协作者的约束清单。内容跟本文重叠，但那份是命令式的，本文是解释式的 |

每完成一个功能模块，往 `DECISIONS.md` 追加一条记录。commit message 要说明**为什么**改，
不只是改了什么（例：`改用JWT而非session，因为要支持移动端无状态认证`）。
