import * as SQLite from 'expo-sqlite';

import { MIGRATIONS } from './schema';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

// 单例：整个 App 生命周期内只开一次库、只跑一次迁移
export function getDb() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DATABASE_NAME).then(async (db) => {
      await db.execAsync(`PRAGMA journal_mode = WAL;`);
      await migrate(db);
      return db;
    });
  }
  return dbPromise;
}

const DATABASE_NAME = 'corddaily.db';

/**
 * **只给开发期用**：把整个本地库删掉重建。
 *
 * 为什么需要它：这个项目在开发期不为历史数据写迁移（改了结构就清库，见 DECISIONS.md），
 * 而 App 跑在 Expo Go 里——清数据得去系统设置里清 Expo Go 的存储，那会把所有
 * Expo 项目的数据连同 SecureStore 里的登录凭证一起抹掉，每次都要重新登录。
 * 这个函数只删这一个库文件，登录状态不受影响。
 *
 * 先关连接再删：文件还开着时删，WAL 那两个附属文件（-wal / -shm）可能留下来，
 * 下次打开会拿到一个"半个旧库"。关掉之后把单例也清空，下一次 getDb() 会重新建库跑迁移。
 */
export async function resetLocalDatabase(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    await db.closeAsync();
    dbPromise = null;
  }
  await SQLite.deleteDatabaseAsync(DATABASE_NAME);
}

// 用 SQLite 内置的 user_version 记录本地库跑到第几版（Expo 官方推荐的迁移写法）。
// 每次启动只补跑「当前版本之后」的那几组语句，所以老用户升级 App 后能拿到新加的列，
// 而不是停在第一次安装时建好的旧表结构上。
async function migrate(db: SQLite.SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>(`PRAGMA user_version`);
  const currentVersion = row?.user_version ?? 0;

  if (currentVersion >= MIGRATIONS.length) return;

  for (let version = currentVersion; version < MIGRATIONS.length; version++) {
    // 一组语句包在事务里：中途失败就整组回滚，不会留下"加了一半列"的库
    await db.withTransactionAsync(async () => {
      for (const statement of MIGRATIONS[version]) {
        await db.execAsync(statement);
      }
    });
  }

  // PRAGMA 不支持参数绑定，这里拼的是数组长度（内部整数），没有注入风险
  await db.execAsync(`PRAGMA user_version = ${MIGRATIONS.length}`);
}
