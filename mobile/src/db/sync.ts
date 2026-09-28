import {
  deleteRemote,
  pushAccounts,
  pushCategories,
  pushRecurring,
  pushTransactions,
  pushTransfers,
} from '@/api/sync';

import { getLocalStats } from './backup';
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

async function markSynced(table: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await getDb();
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(`UPDATE ${table} SET synced = 1 WHERE id IN (${placeholders})`, ids);
}

/**
 * 一条规则贯穿下面每一种记录：**推整行，null 照送**。
 *
 * 服务器那边全是「有则更新、无则插入」，而更新是整行覆盖——少送一个字段不等于"这个字段没变"，
 * 等于"这个字段保持云端的旧值"。所以任何「把某个值清空」的操作（撤回报销、清掉店名、
 * 把二级分类升成一级）都必须送一个显式的 null 上去，否则它永远到不了云端，
 * 而手机端收到 2xx 会把这一行标成已备份，界面上看不出任何异样。
 *
 * 曾经这里有个 `omitNulls`，把 null 字段整个滤掉。它省下的是几个字节的 JSON，
 * 代价是上面那一整类"改了但没同步、还不报错"的 bug（见 DECISIONS.md）。删掉了。
 * 后端每个可空字段的 zod 因此都是 `.nullish()` 而不是 `.optional()`——两者的区别正是
 * "收得下 null" 和 "只收得下缺席"。
 *
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

  // 父在前、子在后：子分类的 parentId 指向父，父还没到服务器的话那一条会被打回。
  //
  // 这里**不筛掉内置分类**，尽管 getLocalStats 不把它们算进「未备份」：
  // 服务器上 Category 是 `@@id([userId, id])`，每个用户都得有自己那一行，
  // 账单的外键才落得下。它们是骨架，跟着账单一起上去，只是不占用户看到的计数。
  const categories = await db.getAllAsync<Record<string, unknown>>(
    `SELECT id, name, icon, type, parentId, sortOrder, isActive FROM categories
     WHERE synced = 0 ORDER BY parentId IS NOT NULL, sortOrder`,
  );
  if (categories.length) {
    // 一个请求推整批，服务器按数组顺序写——上面那个 ORDER BY 已经把父排在前面了。
    // 整批成功才 markSynced：半途失败时这些行留着 synced = 0，下次重推，
    // 而服务器那边全是按 (userId, id) 的 upsert，重推一次结果完全一样
    await pushCategories(categories.map((category) => ({ ...category, isActive: !!category.isActive })));
    await markSynced(
      'categories',
      categories.map((category) => category.id as string),
    );
    result.categories = categories.length;
  }

  const accounts = await db.getAllAsync<Record<string, unknown>>(
    `SELECT id, name, type, currency, openingBalance, icon FROM accounts WHERE synced = 0`,
  );
  if (accounts.length) {
    await pushAccounts(accounts);
    await markSynced(
      'accounts',
      accounts.map((account) => account.id as string),
    );
    result.accounts = accounts.length;
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

    // 这里的 null 尤其有含义：reimbursedAt 为空是「还没收回来」，
    // merchant / location / remarks 为空是「用户清掉了」——都得原样送上去
    await pushTransactions(
      batch.map((transaction) => ({
        ...transaction,
        // 本地存的是一段 JSON 文本和 0/1，后端要的是数组和布尔
        tags: safeParseTags(transaction.tags),
        isReimbursable: !!transaction.isReimbursable,
        excludeFromStats: !!transaction.excludeFromStats,
        images: images
          .filter((image) => image.transactionId === transaction.id)
          .map((image) => ({ url: image.url })),
      })),
    );
    await markSynced('transactions', ids);
    result.transactions += batch.length;
  }

  const transfers = await db.getAllAsync<Record<string, unknown>>(
    `SELECT id, amount, date, note, fromAccountId, toAccountId FROM transfers WHERE synced = 0`,
  );
  if (transfers.length) {
    // 同账单：整行推，note 清空了也要让云端跟着空
    await pushTransfers(transfers);
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
    await pushRecurring({ ...rule, isActive: !!rule.isActive });
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

  // 删除也算"有东西要推"：只删过账、没记过账的那一天，云端同样该跟上。
  // 用 unsyncedTotal 而不是"所有 synced = 0 的行"：装完 App 就有的那 30 行内置分类和账户
  // 不该让自动同步在用户一笔账都没记的时候空跑一趟（见 db/backup.ts 的 PendingCounts）
  const { unsyncedTotal } = await getLocalStats();
  if (unsyncedTotal === 0 && (await countPendingDeletions()) === 0) return;

  try {
    await pushUnsynced();
  } catch (error) {
    await markSyncFailed(describeError(error));
  }
}

/**
 * 把 axios 那一坨错误压成一句人话——它会原样显示在自动同步页上。
 *
 * 4xx 带上服务器那句 message：后端打回来的都是具体原因
 * （「One or more categories do not belong to this user」这种），
 * 而只显示一个「服务器返回 400」等于把唯一的线索丢掉——
 * 排查时得去翻服务器日志，可 4xx 根本不进日志（见 error.middleware，只有 500 才 console.error）。
 * 5xx 不带：那是服务器内部的事，用户看了也无从下手，而且消息里可能有实现细节。
 */
export function describeError(error: unknown): string {
  const response = (error as { response?: { status?: number; data?: { error?: { message?: string } } } })?.response;
  if (response?.status === 401) return '登录已过期，重新登录后再试';
  if (response?.status) {
    const detail = response.status < 500 ? response.data?.error?.message : undefined;
    return detail ? `服务器返回 ${response.status}：${detail}` : `服务器返回 ${response.status}`;
  }
  return '连不上服务器，可能是没网络或服务器在休眠';
}
