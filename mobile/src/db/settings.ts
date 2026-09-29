import { BASE_CURRENCY, CURRENCY_CATALOG, DEFAULT_CURRENCY_CODES } from '@/constants/currencies';

import { getDb } from './client';

const KNOWN_CODES = new Set(CURRENCY_CATALOG.map((c) => c.code));

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

// ---- 搜索历史 ----

/**
 * 记几条。十条是"一屏放得下、翻不动就该重新打字了"的量——
 * 搜索历史的价值全在最近那三五条，留一百条只是把有用的那几条埋起来。
 */
const SEARCH_HISTORY_LIMIT = 10;

const SEARCH_HISTORY_KEY = 'searchHistory';

/** 最近搜过的词，最新的在最前面。存成 JSON 数组，脏值当作"没有历史"而不是让搜索页崩掉 */
export async function getSearchHistory(): Promise<string[]> {
  const raw = await getSetting(SEARCH_HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * 记一条搜索词。
 *
 * 搜过的词**先删后插**，不是"已经有了就跳过"：搜索历史排的是"最近用过"，
 * 不是"第一次用过"。再搜一次「星巴克」它就该回到第一位，否则越常用的词反而沉得越深。
 *
 * 大小写不敏感地去重（`Starbucks` 和 `starbucks` 是同一个词），但**存用户刚打的那一份**——
 * 他这次是怎么写的，下次点历史回去的就该是那一份。
 */
export async function pushSearchHistory(keyword: string): Promise<void> {
  const trimmed = keyword.trim();
  if (!trimmed) return;

  const history = await getSearchHistory();
  const deduped = history.filter((item) => item.toLowerCase() !== trimmed.toLowerCase());
  const next = [trimmed, ...deduped].slice(0, SEARCH_HISTORY_LIMIT);
  await setSetting(SEARCH_HISTORY_KEY, JSON.stringify(next));
}

export async function clearSearchHistory(): Promise<void> {
  await removeSetting(SEARCH_HISTORY_KEY);
}

// ---- 启用的币种 ----

/**
 * 记账时能选哪几种外币。存一个 JSON 数组，本位币不在里面（它永远可选）。
 *
 * 放 app_settings 而不是单开一张表：这就是一串代码，没有第二个字段，
 * 排序就是数组顺序。哪天要给每个币种再挂点什么（比如"默认汇率来源"）再拆表不迟。
 *
 * **不跟着备份走**：它是这台手机上"我平时用哪几种钱"的偏好，
 * 而不是账本内容——换了手机重新勾一遍就行，那比把一份别人的偏好恢复过来更合理。
 */
const ENABLED_CURRENCIES_KEY = 'enabledCurrencies';

export async function getEnabledCurrencyCodes(): Promise<string[]> {
  const raw = await getSetting(ENABLED_CURRENCIES_KEY);
  // 从没设置过 → 用默认那几个。**不能跟"用户手动清空了"混为一谈**，
  // 所以清空存的是 '[]' 而不是删掉这个键：那时候就该真的一个外币都不列
  if (raw === null) return [...DEFAULT_CURRENCY_CODES];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_CURRENCY_CODES];
    // 过滤掉目录里已经没有的代码：目录是跟着 App 版本走的，降级或改名之后
    // 留在这里的孤儿代码会在界面上显示成一行没有名字没有旗子的东西
    return parsed.filter((code): code is string => typeof code === 'string' && KNOWN_CODES.has(code));
  } catch {
    return [...DEFAULT_CURRENCY_CODES];
  }
}

export async function setEnabledCurrencyCodes(codes: string[]): Promise<void> {
  // 本位币不进这个清单（它永远可选），去重之后按传进来的顺序存
  const cleaned = [...new Set(codes)].filter((code) => code !== BASE_CURRENCY && KNOWN_CODES.has(code));
  await setSetting(ENABLED_CURRENCIES_KEY, JSON.stringify(cleaned));
}
