import type { BackupBundle } from '@/db/backup';

import { apiClient } from './client';

/**
 * 同步用到的几个接口。这一层只负责"发请求、把 data 摘出来"，
 * 什么该推、推完怎么标记，在 `db/sync.ts` 里。
 *
 * 除了周期规则，全都是批量的。分类和账户曾经是一条一个 POST，理由是"数量小、
 * 只在第一次全量走一遍"——这个前提后来塌了：内置分类涨到 36 个，而且**拖一次排序
 * 会把那一层整层标脏**，于是一次很普通的操作要几十个来回。慢的是网络往返，不是数据量。
 * 周期规则还是单条：它是用户一条一条建的，同时脏一批的场景不存在。
 */

export type CloudSummary = {
  transactions: number;
  categories: number;
  accounts: number;
  lastUploadAt: string | null;
};

/** 云端有没有这个账号的数据。重装后那句「云端有 N 笔账单」靠它 */
export async function fetchCloudSummary(): Promise<CloudSummary> {
  const res = await apiClient.get('/sync/summary');
  return res.data.data;
}

/** 整包拉回来。它的结构跟导出的备份文件完全一样，所以能直接喂给 planImport */
export async function fetchCloudBundle(): Promise<BackupBundle> {
  const res = await apiClient.get('/sync/bundle');
  return res.data.data;
}

/** `updated` 是这一批里**已经在云端、这次被改写**的条数——编辑过的记录走这条路 */
export type BatchResult = { inserted: number; updated: number; skipped?: number };

/** 父在前、子在后由调用方排好：服务器按数组顺序写，子分类的 parentId 得先有着落 */
export async function pushCategories(categories: Record<string, unknown>[]): Promise<BatchResult> {
  const res = await apiClient.post('/categories/batch', { categories });
  return res.data.data;
}

export async function pushAccounts(accounts: Record<string, unknown>[]): Promise<BatchResult> {
  const res = await apiClient.post('/accounts/batch', { accounts });
  return res.data.data;
}

export async function pushTransactions(transactions: Record<string, unknown>[]): Promise<BatchResult> {
  const res = await apiClient.post('/transactions/batch', { transactions });
  return res.data.data;
}

export async function pushTransfers(transfers: Record<string, unknown>[]): Promise<BatchResult> {
  const res = await apiClient.post('/transfers/batch', { transfers });
  return res.data.data;
}

export async function pushRecurring(rule: Record<string, unknown>): Promise<void> {
  await apiClient.post('/recurring-transactions', rule);
}

/**
 * 在云端删掉一条。本地删除留下的墓碑（见 db/deletions.ts）靠它兑现。
 *
 * **404 当成成功**：服务器上本来就没有这一条（推送前就删了、或者上次删成功但墓碑没撤掉），
 * 那"让它不存在"这个目标已经达到了。当成失败的话，那块碑会永远撤不掉，
 * 每次备份都在同一条上重试。
 */
export async function deleteRemote(kind: 'transaction' | 'category' | 'account', id: string): Promise<void> {
  const path = { transaction: 'transactions', category: 'categories', account: 'accounts' }[kind];
  try {
    await apiClient.delete(`/${path}/${id}`);
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status !== 404) throw error;
  }
}
