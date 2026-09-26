import { getDb } from './client';

/**
 * 删除墓碑。
 *
 * 本地删一行就是真的删掉了，行没了之后没有任何线索能说明"服务器上还留着一条"。
 * 于是会出现：本地删了账单、点了备份，云端那条还在——推送只看 `synced = 0`，
 * 而被删的行连同它的 synced 标记一起消失了。
 *
 * 所以删之前先立一块碑。三条规矩：
 *
 * 1. **只给已经推上去过的行立碑**（`synced = 1`）。从没出门的记录服务器压根没有，
 *    给它立碑等于下次备份时对着服务器删一个不存在的 id。
 * 2. **顺手存一个 label**（标题 / 分类名 / 账户名）。行已经没了，事后拼不出这个字符串，
 *    而备份确认弹层要列出"这次会从云端删掉哪几条"——没有名字的一串 UUID 没法让人判断。
 * 3. **删除同步是可选的**。用户在那个弹层里不勾，碑就留着，下次备份再问一次；
 *    不勾不等于放弃，等于"这次先别动云端"。
 */

export type DeletionKind = 'transaction' | 'category' | 'account';

export type PendingDeletion = {
  kind: DeletionKind;
  id: string;
  label: string;
  deletedAt: string;
};

/** 在删掉这一行**之前**调用：它要读那一行的 synced 才知道该不该立碑 */
export async function recordDeletion(kind: DeletionKind, id: string, label: string): Promise<void> {
  const db = await getDb();
  const table = { transaction: 'transactions', category: 'categories', account: 'accounts' }[kind];

  const row = await db.getFirstAsync<{ synced: number }>(`SELECT synced FROM ${table} WHERE id = ?`, [id]);
  if (!row || row.synced !== 1) return;

  await db.runAsync(
    `INSERT OR REPLACE INTO deleted_records (kind, id, label, deletedAt) VALUES (?, ?, ?, ?)`,
    [kind, id, label, new Date().toISOString()],
  );
}

export async function listPendingDeletions(): Promise<PendingDeletion[]> {
  const db = await getDb();
  // 账单排在前面：服务器上删分类/账户之前，挂在它们下面的账单得先没了，否则会被外键挡下来
  return db.getAllAsync<PendingDeletion>(
    `SELECT kind, id, label, deletedAt FROM deleted_records
     ORDER BY CASE kind WHEN 'transaction' THEN 0 ELSE 1 END, deletedAt`,
  );
}

export async function countPendingDeletions(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM deleted_records');
  return row?.count ?? 0;
}

/** 服务器上删成功（或者本来就没有）之后，把碑撤掉 */
export async function clearDeletion(kind: DeletionKind, id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM deleted_records WHERE kind = ? AND id = ?', [kind, id]);
}
