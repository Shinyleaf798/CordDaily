import * as SQLite from 'expo-sqlite';

import { MIGRATIONS } from './schema';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

// 单例：整个 App 生命周期内只开一次库、只跑一次迁移
export function getDb() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('corddaily.db').then(async (db) => {
      await db.execAsync(`PRAGMA journal_mode = WAL;`);
      await migrate(db);
      return db;
    });
  }
  return dbPromise;
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
