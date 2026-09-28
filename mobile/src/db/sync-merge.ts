import { fetchCategoryIconBlobs, fetchCloudAccounts, fetchCloudCategories } from '@/api/sync';
import { customIconFileName } from '@/constants/category-icons';

import { isAccountAsShipped, isCategoryAsShipped } from './backup';
import { listCustomIconFiles, restoreCategoryIconBlobs } from './category-icon-files';
import { getDb } from './client';
import { listDeletedIds } from './deletions';
import {
  accountFingerprint,
  categoryFingerprint,
  isUntouchedSinceSync,
  type AccountFingerprintRow,
  type CategoryFingerprintRow,
} from './sync-fingerprint';

/**
 * 把云端对**分类和账户**的改动合并回本地。备份的第一步，推送之前跑。
 *
 * ## 为什么要有这一步
 *
 * 在这之前云端到本地只有一条路：重装后空库 + 用户点恢复。于是两台设备轮流用的时候，
 * A 机改的分类名永远到不了 B 机——B 机点备份只会把自己那份推上去，反过来把 A 的覆盖掉，
 * 而两边谁都看不出发生过什么。
 *
 * ## 三方合并，不是"谁后到谁赢"
 *
 * 光比本地和云端是分不出谁该赢的：两边不一样，可能是本地改了，也可能是云端改了。
 * 要答这个问题必须有第三份——**上次同步时这一行长什么样**（base）。
 * 它就存在 `syncedFingerprint` 里（见 sync-fingerprint.ts，存的是行内容本身，不是哈希）。
 *
 * | 本地 vs base | 云端 vs base | 怎么办 |
 * |---|---|---|
 * | 一样 | 变了 | 云端改的 → **采用云端**，base 跟着更新 |
 * | 变了 | 一样 | 本地改的 → 不动，交给后面的推送。**这不是冲突**，不声张 |
 * | 都变了，且互不相同 | | **真冲突 → 保留本地**，点名告诉用户 |
 * | 一样 | 一样 | 无事发生（顺手把 base 补上） |
 *
 * 第二行和第三行都是"保留本地"，但只有第三行值得说出来：把每一次普通的本地改名
 * 都报成"冲突"，那个词就失去意义了。分得开它们的前提是 base 存在——
 * base 为空时证据不足，按第二行处理（不声张）。
 *
 * 冲突保留本地，是因为用户此刻正拿着这台手机：把他眼前的东西换成另一台设备上的版本，
 * 比"云端那个改动这次没生效"要难解释得多。而且本地那份接着会被推上去，
 * 结果是确定的（本地赢），不是随机的。
 *
 * ## 时钟没有参与
 *
 * 没用 `updatedAt` 比新旧：服务器上 `Category` / `Account` 根本没有这一列，
 * 而且客户端的钟是不可信的——两台设备差几小时的时区/手动改过时间，都会让"谁更新"判反。
 * 三方合并不需要时钟，它比的是内容。
 *
 * ## 三种没法判、于是一律不动的情况
 *
 * 1. **本地有、云端没有**：可能是本地刚建的（还没推），也可能是云端删了。
 *    服务器上没有删除墓碑表，分不出来。按"本地刚建的"处理——什么都不做，等推送。
 *    往"多推一条"的方向错是安全的，反过来是替用户删东西。
 * 2. **云端有、本地没有，而本地墓碑里有这个 id**：本地删过它，删除会在推送阶段执行。
 *    这时候把它拉回来，用户会看到自己删掉的分类自己长回来了。
 * 3. **本地 base 为空（这一行从没推上去过）、云端却有同 id**：最常见的是内置分类——
 *    两台设备各自 seed 出同一批常量 id，A 推了、B 没推。没有 base 就没法判谁改的，
 *    于是退回一个够用的判据：本地这一行**还跟出厂值一样**就采用云端（B 没动过它，
 *    A 整理过的名字理应下来）；本地已经改过则算冲突，保留本地。
 *
 * ## 账单不在这里
 *
 * 账单几千条，每次同步全量拉下来比对在免费实例上不现实，而且"云端有、本地没有"
 * 到底是新增还是删除，需要服务器也留墓碑才答得了。账单继续只推不拉（CLAUDE.md 原则#1）。
 */

export type MergeResult = {
  /** 从云端采纳下来的行数（分类 + 账户） */
  adopted: number;
  /** 云端有、本地没有，新插进来的行数 */
  added: number;
  /** 两边都改过、保留了本地的那些。名字拿来在结果里列出去 */
  conflicts: string[];
  /** 为了这次合并从云端补下来的图片张数 */
  icons: number;
};

type LocalCategory = CategoryFingerprintRow & { syncedFingerprint: string | null; synced: number };
type LocalAccount = AccountFingerprintRow & { syncedFingerprint: string | null; synced: number };

export async function mergeFromCloud(): Promise<MergeResult> {
  const db = await getDb();
  const result: MergeResult = { adopted: 0, added: 0, conflicts: [], icons: 0 };

  const [remoteCategories, remoteAccounts] = await Promise.all([fetchCloudCategories(), fetchCloudAccounts()]);

  // 墓碑：本地删过的 id 不能被云端再拉回来（删除本身会在推送阶段执行）
  const deletedCategoryIds = new Set(await listDeletedIds('category'));
  const deletedAccountIds = new Set(await listDeletedIds('account'));

  const localCategories = await db.getAllAsync<LocalCategory>(
    `SELECT id, name, icon, type, parentId, sortOrder, isActive, synced, syncedFingerprint FROM categories`,
  );
  const localById = new Map(localCategories.map((row) => [row.id, row]));

  // 父在前：新插进来的子分类要有个已经存在的 parentId 可指
  const orderedRemote = [...remoteCategories].sort((a, b) => Number(!!a.parentId) - Number(!!b.parentId));

  for (const remote of orderedRemote) {
    const normalized: CategoryFingerprintRow = {
      id: remote.id,
      name: remote.name,
      icon: remote.icon ?? null,
      type: remote.type,
      parentId: remote.parentId ?? null,
      sortOrder: remote.sortOrder ?? 0,
      isActive: remote.isActive ? 1 : 0,
    };
    const remoteFp = categoryFingerprint(normalized);
    const local = localById.get(remote.id);

    if (!local) {
      if (deletedCategoryIds.has(remote.id)) continue;
      await db.runAsync(
        `INSERT OR IGNORE INTO categories
           (id, name, icon, type, parentId, sortOrder, isActive, synced, syncedFingerprint)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [
          normalized.id,
          normalized.name,
          normalized.icon,
          normalized.type,
          normalized.parentId,
          normalized.sortOrder,
          normalized.isActive ? 1 : 0,
          remoteFp,
        ],
      );
      result.added += 1;
      continue;
    }

    const localFp = categoryFingerprint(local);
    if (localFp === remoteFp) {
      // 两边内容已经一样了。顺手把 base 修正过来：否则一个"改了又改回去、
      // 而云端恰好也是这个样子"的行会一直被算成待上传
      if (local.syncedFingerprint !== localFp) {
        await db.runAsync(`UPDATE categories SET synced = 1, syncedFingerprint = ? WHERE id = ?`, [localFp, local.id]);
      }
      continue;
    }

    const localUnchanged = isUntouchedSinceSync(local, localFp, () => isCategoryAsShipped(local));

    if (!localUnchanged) {
      // 本地改过 → 一律保留本地，等推送把它送上去。
      //
      // 但**只有能证明云端也动过，才算冲突**：本地改了、云端还停在 base 上，
      // 那就是一次再普通不过的本地编辑，报成"冲突"会让每一次改名都弹一句吓人的话。
      // base 为空时证据不足（判不出云端动没动过），同样不报——宁可少说，不要瞎说
      if (local.syncedFingerprint !== null && remoteFp !== local.syncedFingerprint) {
        result.conflicts.push(local.name);
      }
      continue;
    }

    await db.runAsync(
      `UPDATE categories
          SET name = ?, icon = ?, parentId = ?, sortOrder = ?, isActive = ?, synced = 1, syncedFingerprint = ?
        WHERE id = ?`,
      [
        normalized.name,
        normalized.icon,
        normalized.parentId,
        normalized.sortOrder,
        normalized.isActive ? 1 : 0,
        remoteFp,
        local.id,
      ],
    );
    result.adopted += 1;
  }

  const localAccounts = await db.getAllAsync<LocalAccount>(
    `SELECT id, name, type, currency, openingBalance, icon, synced, syncedFingerprint FROM accounts`,
  );
  const localAccountById = new Map(localAccounts.map((row) => [row.id, row]));

  for (const remote of remoteAccounts) {
    const normalized: AccountFingerprintRow = {
      id: remote.id,
      name: remote.name,
      type: remote.type,
      currency: remote.currency,
      // Prisma 的 Decimal 过 JSON 之后是字符串，不转的话指纹永远对不上，
      // 每次同步都会把账户判成"云端改了"
      openingBalance: Number(remote.openingBalance ?? 0),
      icon: remote.icon ?? null,
    };
    const remoteFp = accountFingerprint(normalized);
    const local = localAccountById.get(remote.id);

    if (!local) {
      if (deletedAccountIds.has(remote.id)) continue;
      await db.runAsync(
        `INSERT OR IGNORE INTO accounts
           (id, name, type, currency, openingBalance, icon, createdAt, synced, syncedFingerprint)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [
          normalized.id,
          normalized.name,
          normalized.type,
          normalized.currency,
          normalized.openingBalance,
          normalized.icon,
          new Date().toISOString(),
          remoteFp,
        ],
      );
      result.added += 1;
      continue;
    }

    const localFp = accountFingerprint(local);
    if (localFp === remoteFp) {
      if (local.syncedFingerprint !== localFp) {
        await db.runAsync(`UPDATE accounts SET synced = 1, syncedFingerprint = ? WHERE id = ?`, [localFp, local.id]);
      }
      continue;
    }

    const localUnchanged = isUntouchedSinceSync(local, localFp, () =>
      isAccountAsShipped({ id: local.id, name: local.name, openingBalance: local.openingBalance }),
    );
    if (!localUnchanged) {
      // 同分类：保留本地，但只有云端也确实动过才算冲突
      if (local.syncedFingerprint !== null && remoteFp !== local.syncedFingerprint) {
        result.conflicts.push(local.name);
      }
      continue;
    }

    await db.runAsync(
      `UPDATE accounts
          SET name = ?, type = ?, currency = ?, openingBalance = ?, icon = ?, synced = 1, syncedFingerprint = ?
        WHERE id = ?`,
      [
        normalized.name,
        normalized.type,
        normalized.currency,
        normalized.openingBalance,
        normalized.icon,
        remoteFp,
        local.id,
      ],
    );
    result.adopted += 1;
  }

  result.icons = await downloadMissingIcons();
  return result;
}

/**
 * 把「库里有分类在引用、盘上却没有」的自定义图标补下来。
 *
 * **必须等分类合并完再跑**：要补哪几张是从分类表现算的，而刚才那一轮可能刚把一行
 * `icon = custom:xxx.jpg` 写进来。早跑一步就正好漏掉它。
 *
 * 为什么非有这一步不可：云端到本地原来只有「恢复」一条路，而整包里是带着图片本体的
 * （`bundle.categoryIcons`）。合并这条新路只拉分类行，图不会跟着走——
 * 于是手机上那一行指着一个不存在的文件，画出来是一个 📦，用户还无从知道图去哪了。
 * 而"在一台设备上传图、另一台拿到图"正是这整套东西要解决的事。
 *
 * **失败了不抛**：图没补上，分类的名字和层级已经合并好了，那部分成果不该被一次图片请求
 * 作废。下次备份会重新算一遍、再补一次——跟上传那条路一样，它自己会愈合。
 */
async function downloadMissingIcons(): Promise<number> {
  try {
    const db = await getDb();
    const rows = await db.getAllAsync<{ icon: string | null }>(
      "SELECT icon FROM categories WHERE icon LIKE 'custom:%'",
    );
    const referenced = new Set(
      rows.map((row) => customIconFileName(row.icon)).filter((name): name is string => !!name),
    );
    if (!referenced.size) return 0;

    const onDisk = new Set(listCustomIconFiles());
    const missing = [...referenced].filter((name) => !onDisk.has(name));
    if (!missing.length) return 0;

    let restored = 0;
    // 一批 50 个名字，服务器那边的上限
    for (let i = 0; i < missing.length; i += 50) {
      restored += await restoreCategoryIconBlobs(await fetchCategoryIconBlobs(missing.slice(i, i + 50)));
    }
    return restored;
  } catch {
    return 0;
  }
}
