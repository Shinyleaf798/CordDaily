import type { BackupBundle } from '@/db/backup';

import { apiClient } from './client';

/**
 * 同步用到的几个接口。这一层只负责"发请求、把 data 摘出来"，
 * 什么该推、推完怎么标记，在 `db/sync.ts` 里。
 *
 * 分类和账户是**一条一条** POST 的（后端那两个接口是单条 upsert），
 * 交易、转账、周期规则走 batch。没给分类做批量接口是因为它们数量小（几十条）
 * 而且只在第一次推的时候全量走一遍——为此多开一个端点不划算。
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

export async function pushCategory(category: Record<string, unknown>): Promise<void> {
  await apiClient.post('/categories', category);
}

export async function pushAccount(account: Record<string, unknown>): Promise<void> {
  await apiClient.post('/accounts', account);
}

export type BatchResult = { inserted: number; skipped: number };

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
