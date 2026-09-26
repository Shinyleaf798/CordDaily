import { getDb } from './client';

/**
 * `app_settings` 那张 key-value 表的读写口子。
 *
 * 在这之前，每个需要存偏好的模块（budgets、accounts、categories）各自写一遍
 * `SELECT "value" FROM app_settings ...`。三份一模一样的 SQL，其中列名上的双引号还是
 * 踩过坑之后补的（KEY 是 SQLite 关键字，见 budgets.ts 的说明）——那种修补最容易只改了一处。
 *
 * 这张表**不进服务器**：里面全是本机偏好（月预算、同步周期、上次备份时间、各种"已经看过了"标记）。
 */

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>('SELECT "value" FROM app_settings WHERE "key" = ?', [key]);
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO app_settings ("key", "value") VALUES (?, ?)', [key, value]);
}

export async function removeSetting(key: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM app_settings WHERE "key" = ?', [key]);
}

/**
 * 自动同步的周期。**默认 `off`**——本地优先，账先只在这台手机上（CLAUDE.md 原则#1）。
 *
 * 「关」是一个正经选项而不是"周期设成无穷大"：要不要自动、多久一次，是两个问题，
 * 界面上也是一个开关加一组周期（见设计画布）。
 */
export type AutoSyncPeriod = 'off' | 'daily' | 'weekly' | 'monthly';

export const AutoSyncPeriodDays: Record<Exclude<AutoSyncPeriod, 'off'>, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
};

export const AutoSyncPeriodLabels: Record<AutoSyncPeriod, string> = {
  off: '关闭',
  daily: '每天',
  weekly: '每 7 天',
  monthly: '每月',
};

const Keys = {
  autoSyncPeriod: 'autoSyncPeriod',
  lastCloudBackupAt: 'lastCloudBackupAt',
  lastFileBackupAt: 'lastFileBackupAt',
  lastSyncError: 'lastSyncError',
} as const;

export async function getAutoSyncPeriod(): Promise<AutoSyncPeriod> {
  const value = await getSetting(Keys.autoSyncPeriod);
  return value === 'daily' || value === 'weekly' || value === 'monthly' ? value : 'off';
}

export async function setAutoSyncPeriod(period: AutoSyncPeriod): Promise<void> {
  await setSetting(Keys.autoSyncPeriod, period);
}

export type BackupState = {
  /** 上一次成功推到云端的时刻。没推过是 null */
  lastCloudBackupAt: string | null;
  /** 上一次导出成文件的时刻。跟云端各记各的——两者救的东西不一样 */
  lastFileBackupAt: string | null;
  /** 上一次自动同步失败的原因。成功一次就清掉 */
  lastSyncError: { at: string; message: string } | null;
};

export async function getBackupState(): Promise<BackupState> {
  const [cloud, file, error] = await Promise.all([
    getSetting(Keys.lastCloudBackupAt),
    getSetting(Keys.lastFileBackupAt),
    getSetting(Keys.lastSyncError),
  ]);

  let parsedError: BackupState['lastSyncError'] = null;
  if (error) {
    // 存的是 JSON，但这是本机可写的一张表，读到脏值不能让整页崩掉——当作"没有错误"
    try {
      const value = JSON.parse(error) as { at?: string; message?: string };
      if (value?.at && value?.message) parsedError = { at: value.at, message: value.message };
    } catch {
      parsedError = null;
    }
  }

  return { lastCloudBackupAt: cloud, lastFileBackupAt: file, lastSyncError: parsedError };
}

export async function markCloudBackupDone(at = new Date().toISOString()): Promise<void> {
  await setSetting(Keys.lastCloudBackupAt, at);
  // 成功一次就把上次的失败擦掉：留着它会让那张卡一直显示一条早就不成立的红字
  await removeSetting(Keys.lastSyncError);
}

export async function markFileBackupDone(at = new Date().toISOString()): Promise<void> {
  await setSetting(Keys.lastFileBackupAt, at);
}

export async function markSyncFailed(message: string): Promise<void> {
  await setSetting(Keys.lastSyncError, JSON.stringify({ at: new Date().toISOString(), message }));
}
