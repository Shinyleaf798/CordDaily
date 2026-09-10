# CordDaily

本地优先的个人记账 App。项目定位、技术栈、核心架构原则见 [CLAUDE.md](CLAUDE.md)；完整数据库 schema / API 清单见 [docs/PROJECT-PLAN.md](docs/PROJECT-PLAN.md)。

## 启动项目

### 一条命令同时跑 backend + mobile

```bash
npm install   # 第一次运行需要，装的是根目录的 concurrently
npm run dev
```

这只是把下面两条命令用 [concurrently](https://www.npmjs.com/package/concurrently) 包在一起跑，两个进程本身还是各自独立（backend 连 Neon 云数据库，跟 mobile 没有编排依赖），日志会用颜色区分 `backend`/`mobile` 前缀。Ctrl+C 会同时停掉两个。

想分开控制（比如只重启其中一个），还是按下面两节分别单独跑。

### 1. Backend

```bash
cd backend
npm install       # 第一次运行需要
npm run dev        # nodemon，监听 3000 端口，改代码自动重启
```

首次运行前，把 `backend/.env.example` 复制成 `backend/.env` 并填好 `DATABASE_URL`（Neon 连接串）等变量。

### 2. Mobile

```bash
cd mobile
npm install         # 第一次运行需要
npx expo start
```

终端会打印一个二维码，用 Expo Go 扫码在真机上打开。

**真机联调必看**：`mobile/.env` 里的 `EXPO_PUBLIC_API_BASE_URL` 必须指向你电脑的**局域网 IP**（例如 `http://192.168.1.10:3000`），不能是 `localhost`——手机和电脑是两台设备，手机上的 `localhost` 指向手机自己，连不到你电脑上跑的 backend。查自己电脑的局域网 IP：

```bash
ipconfig        # Windows，找 IPv4 Address
ifconfig        # macOS/Linux
```

换了 Wi-Fi 网络之后这个 IP 通常会变，需要重新改一次 `mobile/.env`。只用 `expo start --web` 在电脑上跑网页版时，`localhost` 才是对的。

### 常见问题

- **backend 报 `EADDRINUSE: address already in use :::3000`**：说明已经有一个 backend 进程在跑了（比如上一次没关掉），不是端口冲突，找到并关掉那个旧进程即可，不用重启电脑。
- **手机上登录/注册一直失败**：先确认 backend 是否正在跑（`npm run dev` 有没有报错），再检查 `mobile/.env` 的 IP 是否还是当前网络下电脑的局域网 IP。
