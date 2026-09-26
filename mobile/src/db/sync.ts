import {
  deleteRemote,
  pushAccount,
  pushCategory,
  pushRecurring,
  pushTransactions,
  pushTransfers,
} from '@/api/sync';

import { getDb } from './client';
import { clearDeletion, countPendingDeletions, listPendingDeletions } from './deletions';
import {
  AutoSyncPeriodDays,
  getAutoSyncPeriod,
  getBackupState,
  markCloudBackupDone,
  markSyncFailed,
} from './settings';

/**
 * 把本地「还没备份过」（`synced = 0`）的记录单向推给服务器。
 *
 * **只推不拉**（CLAUDE.md 原则#1）。拉只发生在一种情况：本地是空库、用户明确点了恢复。
 *
 * **手动和自动走的是同一个函数**，自动那条只是先过一道周期判断（见 maybeAutoSync）。
 * 分成两套实现的话，两边对"什么算未备份"的定义迟早会分叉。
 *
 * 推送顺序不能乱：分类和账户是账单的外键，必须先落地；一级分类又是子分类的外键，所以
 * 分类内部还要父先子后。服务器那边是按 id upsert 的，重推一次不会变成两行。
 */

export type PushResult = {
  categories: number;
  accounts: number;
  transactions: number;
  transfers: number;
  recurring: number;
  /** 这次在云端删掉了几条。用户没勾"同时删除"时是 0，墓碑原样留着 */
  deletions: number;
};

/** 后端的 zod 用的是 `.optional()`，它**不接受 null**——本地那些可空列必须先把 null 摘掉 */
function omitNulls<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null && value !== undefined));
}

async function markSynced(table: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await getDb();
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(`UPDATE ${table} SET synced = 1 WHERE id IN (${placeholders})`, ids);
}

export async function countUnsynced(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ total: number }>(
    `SELECT (SELECT COUNT(*) FROM transactions WHERE synced = 0)
          + (SELECT COUNT(*) FROM categories WHERE synced = 0)
          + (SELECT COUNT(*) FROM accounts WHERE synced = 0)
          + (SELECT COUNT(*) FROM transfers WHERE synced = 0)
          + (SELECT COUNT(*) FROM recurring_transactions WHERE synced = 0) AS total`,
  );
  return row?.total ?? 0;
}

/**
 * @param withDeletions 要不要把本地删掉的那些也在云端删掉。默认 true——
 *   "备份"的通常含义是让云端跟本地一致。用户在确认弹层里取消勾选时传 false，
 *   那些墓碑会**留着**等下一次：不勾等于"这次先别动云端"，不是放弃。
 */
export async function pushUnsynced(withDeletions = true): Promise<PushResult> {
  const db = await getDb();
  const result: PushResult = {
    categories: 0,
    accounts: 0,
    transactions: 0,
    transfers: 0,
    recurring: 0,
    deletions: 0,
  };

  // 删除走在最前面：本地删掉的分类可能正被云端某条老账单引用着，
  // 而 listPendingDeletions 已经把账单排在分类和账户前面了（外键顺序）
  if (withDeletions) {
    for (const deletion of await listPendingDeletions()) {
      await deleteRemote(deletion.kind, deletion.id);
      await clearDeletion(deletion.kind, deletion.id);
      result.deletions += 1;
    }
  }

  // 父在前、子在后：子分类的 parentId 指向父，父还没到服务器的话那一条会被打回
  const categories = await db.getAllAsync<Record<string, unknown>>(
    `SELECT id, name, icon, type, parentId, sortOrder, isActive FROM categories
     WHERE synced = 0 ORDER BY parentId IS NOT NULL, sortOrder`,
  );
  for (const category of categories) {
    await pushCategory(omitNulls({ ...category, isActive: !!category.isActive }));
    await markSynced('categories', [category.id as string]);
    result.categories += 1;
  }

  const accounts = await db.getAllAsync<Record<string, unknown>>(
    `SELECT id, name, type, currency, openingBalance, icon FROM accounts WHERE synced = 0`,
  );
  for (const account of accounts) {
    await pushAccount(omitNulls(account));
    await markSynced('accounts', [account.id as string]);
    result.accounts += 1;
  }

  const transactions = await db.getAllAsync<Record<string, unknown>>(
    `SELECT id, title, merchant, location, remarks, amount, currency, exchangeRate, amountInBase,
            type, date, tags, isReimbursable, reimbursedAt, excludeFromStats, categoryId, accountId, recurringId
       FROM transactions WHERE synced = 0 ORDER BY date`,
  );

  // 分批推：一次几百条的 JSON 在 Render 免费实例上容易超时，而失败一整批要全部重来。
  // 每批推完就地标记，中途断网时前面几批不用再推一遍
  const BATCH_SIZE = 100;
  for (let offset = 0; offset < transactions.length; offset += BATCH_SIZE) {
    const batch = transactions.slice(offset, offset + BATCH_SIZE);
    const ids = batch.map((transaction) => transaction.id as string);
    const images = await db.getAllAsync<{ transactionId: string; url: string }>(
      `SELECT transactionId, url FROM transaction_images WHERE transactionId IN (${ids.map(() => '?').join(',')})`,
      ids,
    );

    await pushTransactions(
      batch.map((transaction) =>
        omitNulls({
          ...transaction,
          // 本地存的是一段 JSON 文本和 0/1，后端要的是数组和布尔
          tags: safeParseTags(transaction.tags),
          isReimbursable: !!transaction.isReimbursable,
          excludeFromStats: !!transaction.excludeFromStats,
          images: images
            .filter((image) => image.transactionId === transaction.id)
            .map((image) => ({ url: image.url })),
        }),
      ),
    );
    await markSynced('transactions', ids);
    result.transactions += batch.length;
  }

  const transfers = await db.getAllAsync<Record<string, unknown>>(
    `SELECT id, amount, date, note, fromAccountId, toAccountId FROM transfers WHERE synced = 0`,
  );
  if (transfers.length) {
    await pushTransfers(transfers.map(omitNulls));
    await markSynced(
      'transfers',
      transfers.map((transfer) => transfer.id as string),
    );
    result.transfers = transfers.length;
  }

  const recurring = await db.getAllAsync<Record<string, unknown>>(
    `SELECT id, title, remarks, amount, currency, exchangeRate, type, frequency, startDate,
            nextRunDate, endDate, isActive, categoryId, accountId
       FROM recurring_transactions WHERE synced = 0`,
  );
  for (const rule of recurring) {
    await pushRecurring(omitNulls({ ...rule, isActive: !!rule.isActive }));
    await markSynced('recurring_transactions', [rule.id as string]);
    result.recurring += 1;
  }

  await markCloudBackupDone();
  return result;
}

// 脏了的 tags 不该让整批推送失败：这一列是本地写进去的 JSON 文本，
// 真解析不出来时当作没有标签，那笔账本身比它的标签重要得多
function safeParseTags(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value ?? '[]'));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/**
 * App 打开时跑一次。**不跑后台任务**——跟周期交易的补生成用的是同一个时机
 * （CLAUDE.md 原则#4 旁边那条），也就不用碰 background fetch 那一套。
 *
 * 失败不抛给调用方：自动同步是后台行为，没网、凭证过期、服务器在睡都会失败，
 * 拦住启动是不能接受的。记下 `lastSyncError`，下次打开再试；
 * 唯一的呈现是「我的」页那张备份卡和自动同步页上的一行。
 */
export async function maybeAutoSync(): Promise<void> {
  const period = await getAutoSyncPeriod();
  if (period === 'off') return;

  const { lastCloudBackupAt } = await getBackupState();
  if (lastCloudBackupAt) {
    const elapsedDays = (Date.now() - new Date(lastCloudBackupAt).getTime()) / 86400000;
    if (elapsedDays < AutoSyncPeriodDays[period]) return;
  }

  // 删除也算"有东西要推"：只删过账、没记过账的那一天，云端同样该跟上
  if ((await countUnsynced()) === 0 && (await countPendingDeletions()) === 0) return;

  try {
    await pushUnsynced();
  } catch (error) {
    await markSyncFailed(describeError(error));
  }
}

/** 把 axios 那一坨错误压成一句人话——它会原样显示在自动同步页上 */
export function describeError(error: unknown): string {
  const response = (error as { response?: { status?: number } })?.response;
  if (response?.status === 401) return '登录已过期，重新登录后再试';
  if (response?.status) return `服务器返回 ${response.status}`;
  return '连不上服务器，可能是没网络或服务器在休眠';
}
