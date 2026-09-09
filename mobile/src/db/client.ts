import * as SQLite from 'expo-sqlite';

import { MIGRATIONS } from './schema';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

// 单例：整个 App 生命周期内只开一次库、只跑一次建表语句
export function getDb() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('corddaily.db').then(async (db) => {
      for (const statement of MIGRATIONS) {
        await db.execAsync(statement);
      }
      return db;
    });
  }
  return dbPromise;
}
