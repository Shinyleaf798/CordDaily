import { getCloudTransport, type CloudTransport } from '@/api/cloud-transport';

import { getAvatarPushPayload, markAvatarPushed } from './avatar';

import { getLocalStats } from './backup';
import { listUsedCategoryIconNames, readCategoryIconBlobs } from './category-icon-files';
import { getDb } from './client';
import { clearDeletion, countPendingDeletions, listPendingDeletions } from './deletions';
import { mergeFromCloud } from './sync-merge';
import {
  accountFingerprint,
  categoryFingerprint,
  type AccountFingerprintRow,
  type CategoryFingerprintRow,
} from './sync-fingerprint';
import {
  AutoSyncPeriodDays,
  getAutoSyncPeriod,
  getBackupState,
  markCloudBackupDone,
  markSyncFailed,
} from './settings';

/**
 * 备份到云端：先把云端对**分类和账户**的改动合并回本地，再把本地的改动推上去。
 *
 * **拉那一步只管分类和账户**（见 db/sync-merge.ts）。账单仍然只推不拉——
 * 几千条每次全量拉下来比对在免费实例上不现实，而且"云端有、本地没有"到底是新增还是删除，
 * 要服务器也留墓碑才答得了。CLAUDE.md 原则#1 划出去的那条线还在，只是往前挪了两张小表。
 *
 * **先拉后推的顺序不能反**：合并会把"云端改过、本地没动过"的行就地更新掉并记上新的 base，
 * 于是它们不再是脏行，推送阶段自然跳过。反过来先推的话，本地那份会先把云端覆盖掉，
 * 再去拉就永远拉不到任何东西——等于这一步没做。
 *
 * **手动和自动走的是同一个函数**，自动那条只是先过一道周期判断（见 maybeAutoSync）。
 * 分成两套实现的话，两边对"什么算未备份"的定义迟早会分叉。
 *
 * 推送顺序不能乱：分类和账户是账单的外键，必须先落地；一级分类又是子分类的外键，所以
 * 分类内部还要父先子后。服务器那边是按 id upsert 的，重推一次不会变成两行。
 */

export type PushResult = {
  /** 从云端采纳下来的分类/账户行数（本地没动过、云端改了的那些） */
  merged: number;
  /** 云端有、本地没有，这次补进来的分类/账户 */
  pulled: number;
  /** 两边都改过、保留了本地那一份的名字。它们照常被推上去，但要说出来 */
  conflicts: string[];
  /** 合并时从云端**补下来**的分类图片张数。跟下面的 icons（这次传上去的）是两个方向 */
  pulledIcons: number;
  categories: number;
  /** 这次传上去的自定义分类图标张数。图片本体存在 Neon 里，见 backend 的 CategoryIcon */
  icons: number;
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
 * 分类和账户的"已推送"标记：除了 `synced = 1`，还把**刚推上去的那一行的指纹**记下来。
 *
 * 有了它，下次判断"这行要不要推"问的就不再是"动过没有"，而是"跟推上去的那份一不一样"——
 * 改个名再改回来于是不算数（见 db/sync-fingerprint.ts）。
 *
 * 一行一条 UPDATE，不像 markSynced 那样一条 IN 批量搞定：每行的指纹都不一样，
 * 批量写要么拼一大串 CASE WHEN，要么临时表，为几十行不值得。
 */
async function markSyncedWithFingerprint(table: string, rows: { id: string; fingerprint: string }[]): Promise<void> {
  if (!rows.length) return;
  const db = await getDb();
  for (const row of rows) {
    await db.runAsync(`UPDATE ${table} SET synced = 1, syncedFingerprint = ? WHERE id = ?`, [
      row.fingerprint,
      row.id,
    ]);
  }
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

  // 这次备份往哪儿发：用户自己的 Neon，还是自己那台服务器（见 api/cloud-transport.ts）。
  // **整次备份只问一次**，而不是每个步骤各问一遍：中途要是换了目的地，
  // 已经标成"已备份"的那几批就指着另一个库了
  const cloud = await getCloudTransport();

  const result: PushResult = {
    merged: 0,
    pulled: 0,
    conflicts: [],
    pulledIcons: 0,
    categories: 0,
    icons: 0,
    accounts: 0,
    transactions: 0,
    transfers: 0,
    recurring: 0,
    deletions: 0,
  };

  // 先合并：把云端改过、而本地没动过的分类/账户就地更新掉。
  // 放在删除之前，是因为合并要读墓碑来回答"云端有、本地没有"是新增还是删除——
  // 删除一旦执行完，墓碑就被清掉了，那个问题就再也答不了
  const merge = await mergeFromCloud();
  result.merged = merge.adopted;
  result.pulled = merge.added;
  result.conflicts = merge.conflicts;
  result.pulledIcons = merge.icons;

  // 删除走在最前面：本地删掉的分类可能正被云端某条老账单引用着，
  // 而 listPendingDeletions 已经把账单排在分类和账户前面了（外键顺序）
  if (withDeletions) {
    for (const deletion of await listPendingDeletions()) {
      await cloud.deleteRemote(deletion.kind, deletion.id);
      await clearDeletion(deletion.kind, deletion.id);
      result.deletions += 1;
    }
  }

  // 图标先于分类上去，理由跟恢复时"先落图后写库"是同一条：这两样凑不成一个原子操作，
  // 只能挑错得轻的顺序。先图后行，崩在中间留下的是一张没人引用的图（占几 KB）；
  // 反过来则是云端一行分类指着一张不存在的图，而那正是重装恢复时会显形的坏
  result.icons = await pushMissingIcons(cloud);

  // 父在前、子在后：子分类的 parentId 指向父，父还没到服务器的话那一条会被打回。
  //
  // 这里**不筛掉内置分类**，尽管 getLocalStats 不把它们算进「未备份」：
  // 服务器上 Category 是 `@@id([userId, id])`，每个用户都得有自己那一行，
  // 账单的外键才落得下。它们是骨架，跟着账单一起上去，只是不占用户看到的计数。
  // 取全部行再在 JS 里筛，不写 WHERE：要判的是"跟上次推上去的那份一不一样"，
  // 而指纹是拼出来的字符串，SQL 里算不出来（见 db/sync-fingerprint.ts）。
  // 分类就几十行，多读一遍的代价可以忽略；filter 保序，父在前的顺序不会被打乱
  const allCategories = await db.getAllAsync<CategoryFingerprintRow & { syncedFingerprint: string | null }>(
    `SELECT id, name, icon, type, parentId, sortOrder, isActive, syncedFingerprint FROM categories
     ORDER BY parentId IS NOT NULL, sortOrder`,
  );
  const categories = allCategories.filter((category) => category.syncedFingerprint !== categoryFingerprint(category));
  if (categories.length) {
    // 一个请求推整批，服务器按数组顺序写——上面那个 ORDER BY 已经把父排在前面了。
    // 整批成功才写标记：半途失败时这些行的指纹留在旧值上，下次重推，
    // 而服务器那边全是按 (userId, id) 的 upsert，重推一次结果完全一样
    await cloud.pushCategories(
      categories.map(({ syncedFingerprint: _ignored, ...category }) => ({
        ...category,
        isActive: !!category.isActive,
      })),
    );
    // 指纹按**推之前那一刻的行**算。推送期间用户又改了一笔的话，新值跟这个指纹对不上，
    // 下次自然会再推一遍——反过来（推完再查一次库算指纹）会把那次改动当成已经上去了
    await markSyncedWithFingerprint(
      'categories',
      categories.map((category) => ({ id: category.id, fingerprint: categoryFingerprint(category) })),
    );
    result.categories = categories.length;
  }

  // 同分类：按指纹筛，不按 synced
  const allAccounts = await db.getAllAsync<AccountFingerprintRow & { syncedFingerprint: string | null }>(
    `SELECT id, name, type, currency, openingBalance, icon, syncedFingerprint FROM accounts`,
  );
  const accounts = allAccounts.filter((account) => account.syncedFingerprint !== accountFingerprint(account));
  if (accounts.length) {
    await cloud.pushAccounts(accounts.map(({ syncedFingerprint: _ignored, ...account }) => account));
    await markSyncedWithFingerprint(
      'accounts',
      accounts.map((account) => ({ id: account.id, fingerprint: accountFingerprint(account) })),
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
    await cloud.pushTransactions(
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
    await cloud.pushTransfers(transfers);
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
    await cloud.pushRecurring({ ...rule, isActive: !!rule.isActive });
    await markSynced('recurring_transactions', [rule.id as string]);
    result.recurring += 1;
  }

  // 头像跟账单一起推。放在时间戳前面、也裹在各自的 try 里：
  // 换了张头像没传上去，不该让「这次备份失败了」出现在一次账全推成功之后
  try {
    const avatar = await getAvatarPushPayload();
    if (avatar && cloud.pushAvatar) {
      await cloud.pushAvatar(avatar.data);
      await markAvatarPushed();
    }
  } catch {
    // 咽掉：下次备份会再试一次（推送标记只有成功了才写）
  }

  // 云端那一侧的时间戳（只有 Neon 那条路有：它没有服务器替它记这件事）。
  // 放在 markCloudBackupDone 前面但**不让它拖垮整次备份**——账已经全推上去了，
  // 为一个"上次什么时候推的"显示值把成功报成失败，是拿真正重要的那件事去赌一个次要的
  try {
    await cloud.finishPush?.();
  } catch {
    // 故意咽掉：这一行失败的唯一后果是别的设备上那个时间戳偏旧
  }

  await markCloudBackupDone();
  return result;
}

/**
 * 把云端还没有的那些自定义图标传上去，返回这次传了几张。
 *
 * **问云端要一份已有清单，而不是在本地记"传过没传过"。** 本地台账走散之后没人发现得了
 * （见 api/sync.ts 的 fetchCloudIconNames），而这条路每次都拿云端的实际情况当答案，
 * 所以它会自己愈合：某次上传失败、或者服务器那边丢了一行，下次备份自动补上。
 *
 * **一张图都没有的用户一个请求都不发。** 绝大多数人从没传过图，
 * 不该为这个功能在每次备份时多等一个来回。
 *
 * 失败**不吞**：图没上去而分类上去了，就是云端存着一个指向空气的引用，
 * 那正是这一步要防的事。让整次备份失败、下次重来，比留下一个坏掉的云端状态好。
 */
async function pushMissingIcons(cloud: CloudTransport): Promise<number> {
  const used = await listUsedCategoryIconNames();
  if (!used.length) return 0;

  const remote = new Set(await cloud.fetchCloudIconNames());
  const missing = used.filter((name) => !remote.has(name));
  if (!missing.length) return 0;

  // 文件不在了（用户清过沙盒）的那些读不出来，readCategoryIconBlobs 直接跳过：
  // 传一张空图上去比不传更糟
  const blobs = await readCategoryIconBlobs(missing);

  // 分批：服务器一批收 20 张，而且请求体里装的是图片，一次塞太多在 Render 免费实例上是真的会超时
  const BATCH_SIZE = 10;
  let uploaded = 0;
  for (let offset = 0; offset < blobs.length; offset += BATCH_SIZE) {
    const batch = blobs.slice(offset, offset + BATCH_SIZE);
    const { inserted } = await cloud.pushCategoryIcons(batch);
    uploaded += inserted;
  }
  return uploaded;
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

  // Neon 那条路上根本没有 HTTP 状态码可看，而它抛出来的消息**已经是一句人话**了
  // （api/neon-transport.ts 的 describeSqlError 翻过一道）。不先认出来的话，
  // 「云端还没有这条账单用的分类」会被下面那句笼统的兜底盖掉，用户拿不到任何线索
  if (!(error as { isAxiosError?: boolean })?.isAxiosError && error instanceof Error && error.message) {
    return error.message;
  }

  return '连不上服务器，可能是没网络或服务器在休眠';
}
