import type { BackupBundle } from '@/db/backup';
import type { CategoryIconBlob } from '@/db/category-icon-files';
import { hasRemote } from '@/db/neon/client';

import * as httpTransport from './sync';
import type { BatchResult, CloudAccount, CloudCategory, CloudSummary } from './sync';

/**
 * 「云端」这条通道的**接口**，以及此刻该走哪一条。
 *
 * 现在有两个实现：`api/sync.ts`（打向自己那台 Express + JWT）和 `api/neon-transport.ts`
 * （直连用户自己的 Neon）。它们收发的东西完全一样，区别只有"发到哪儿去"。
 *
 * ## 为什么是换传输层，不是另写一个 neon 版的 pushUnsynced
 *
 * `db/sync.ts` 里那两百行不是"发请求"，是**判断什么该发**：分类按指纹比对而不是按 synced、
 * 父分类必须排在子分类前面、账单一百条一批且每批推完就地标记、null 要显式送上去、
 * 墓碑要在合并之前兑现。这些规则每一条都是踩过坑之后写下来的（注释里记着为什么），
 * 而它们跟"目的地是 HTTP 还是 SQL"一点关系都没有。
 *
 * 复制一份到 Neon 版本上，就等于把这些规则复制一份——然后其中一份会先被改到。
 * 这个项目已经为同一件事立过规矩：「分成两套实现，两边对什么算未备份的定义迟早会分叉」
 * （db/sync.ts）、「一份格式，两个来源」（db/backup.ts）。这里是同一条。
 *
 * ## 挑哪一条
 *
 * **配了 Neon 就走 Neon。** 不做成一个让用户选的开关：两条通道存的是两份不会互相同步的
 * 数据，而"我这次备份去了哪儿"是个用户永远不该需要回答的问题。
 * 自己填了连接串的人，意思就是"我要用我自己的库"。
 */
export type CloudTransport = {
  fetchCloudSummary(): Promise<CloudSummary>;
  fetchCloudBundle(): Promise<BackupBundle>;
  fetchCloudCategories(): Promise<CloudCategory[]>;
  fetchCloudAccounts(): Promise<CloudAccount[]>;
  fetchCloudIconNames(): Promise<string[]>;
  fetchCategoryIconBlobs(names: string[]): Promise<CategoryIconBlob[]>;
  pushCategoryIcons(icons: { name: string; data: string }[]): Promise<{ inserted: number; skipped: number }>;
  pushCategories(categories: Record<string, unknown>[]): Promise<BatchResult>;
  pushAccounts(accounts: Record<string, unknown>[]): Promise<BatchResult>;
  pushTransactions(transactions: Record<string, unknown>[]): Promise<BatchResult>;
  pushTransfers(transfers: Record<string, unknown>[]): Promise<BatchResult>;
  pushRecurring(rule: Record<string, unknown>): Promise<void>;
  deleteRemote(kind: 'transaction' | 'category' | 'account', id: string): Promise<void>;
  /**
   * 整次推送成功之后调一下。**可选**——HTTP 那条路不需要它：
   * 服务器自己知道谁什么时候推的。Neon 这条没有服务器，"上次备份是什么时候"
   * 要由手机自己往 `app_meta` 里盖一个时间戳，否则换一台手机连上来就看不到这件事。
   */
  finishPush?(): Promise<void>;
};

/**
 * 这次备份该走哪条路。
 *
 * **每次都重新问一遍**，不在模块加载时定死：用户可能刚在设置页里连上或者断开，
 * 而这两个动作都不该需要重启 App 才生效。这个判断只读一次 SecureStore 的缓存值
 * （见 neon/client.ts 的 cachedConnectionString），不值得为它做缓存。
 */
export async function getCloudTransport(): Promise<CloudTransport> {
  if (await hasRemote()) {
    // 动态 import：没连 Neon 的用户不该为这个功能把驱动打进启动路径
    const neonTransport = await import('./neon-transport');
    return neonTransport.transport;
  }
  return httpTransport;
}

export type { BatchResult, CloudAccount, CloudCategory, CloudSummary };
