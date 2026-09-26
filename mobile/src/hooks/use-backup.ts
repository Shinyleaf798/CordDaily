import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fetchCloudSummary } from '@/api/sync';
import { applyImport, getLocalStats, type BackupRange, type ImportPlan } from '@/db/backup';
import { listPendingDeletions } from '@/db/deletions';
import { pushUnsynced } from '@/db/sync';
import { exportToFile, type ExportFormat } from '@/db/backup-file';
import { getAutoSyncPeriod, getBackupState, setAutoSyncPeriod, type AutoSyncPeriod } from '@/db/settings';

/**
 * 「我的」页那张备份卡、以及自动同步设置页要的数据。
 *
 * 两个 query 分开而不是合成一个：本地统计会被每一次记账改掉（记一笔账就多一笔未备份），
 * 备份状态只在真的备份完才变。合在一起的话，随便记一笔账都要把备份时间一起重查。
 */

export function useLocalStats() {
  return useQuery({ queryKey: ['localStats'], queryFn: getLocalStats });
}

export function useBackupState() {
  return useQuery({ queryKey: ['backupState'], queryFn: getBackupState });
}

export function useAutoSyncPeriod() {
  return useQuery({ queryKey: ['autoSyncPeriod'], queryFn: getAutoSyncPeriod });
}

export function useSetAutoSyncPeriod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (period: AutoSyncPeriod) => setAutoSyncPeriod(period),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['autoSyncPeriod'] }),
  });
}

/**
 * 落库。成功之后**把整个缓存全部失效**，不逐个列 key：
 * 一次恢复动的是分类、账户、账单、转账、周期规则和预算——几乎每一张表，
 * 逐个列迟早会漏一个，而漏掉的那个页面会显示一份过期数据，还看不出是哪儿的问题。
 */
export function useApplyImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ plan, choices }: { plan: ImportPlan; choices?: Record<string, string> }) =>
      applyImport(plan, choices ?? {}),
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

/**
 * 推到云端。手动点「备份到云端」和启动时的自动同步走的是同一个 `pushUnsynced()`，
 * 这里只多了"成功之后把统计和备份状态刷一遍"。
 */
export function usePushToCloud() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ withDeletions }: { withDeletions?: boolean } = {}) => pushUnsynced(withDeletions ?? true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['localStats'] });
      queryClient.invalidateQueries({ queryKey: ['backupState'] });
      queryClient.invalidateQueries({ queryKey: ['pendingDeletions'] });
    },
    // 失败也要刷：失败原因记在 app_settings 里，那一行要能立刻显示出来
    onError: () => queryClient.invalidateQueries({ queryKey: ['backupState'] }),
  });
}

/** 等着在云端删掉的那些。备份确认层要把它们逐条列出来——删除不可逆，得先让人看见 */
export function usePendingDeletions() {
  return useQuery({ queryKey: ['pendingDeletions'], queryFn: listPendingDeletions });
}

/** 云端有没有这个账号的数据。只在恢复那一屏用，所以不跟着「我的」页一起常驻请求 */
export function useCloudSummary(enabled = true) {
  return useQuery({ queryKey: ['cloudSummary'], queryFn: fetchCloudSummary, enabled, retry: false });
}

/** 导出成文件。成功之后要刷备份状态——那张卡上的「文件上次」就是它 */
export function useExportToFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ format, range }: { format: ExportFormat; range?: BackupRange }) =>
      exportToFile(format, range ?? {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['backupState'] }),
  });
}
