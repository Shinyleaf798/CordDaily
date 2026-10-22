import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import {
  createRecurringRule,
  deleteRecurringRule,
  listRecurringRules,
  runDueRecurring,
  setRecurringActive,
  updateRecurringRule,
  type CreateRecurringInput,
  type UpdateRecurringInput,
} from '@/db/recurring';
import { invalidateAll } from '@/hooks/use-transactions';

const RECURRING_KEY = ['recurringRules'];

export function useRecurringRules() {
  return useQuery({ queryKey: RECURRING_KEY, queryFn: listRecurringRules });
}

/**
 * 跑一次补生成，记出了东西就把交易那一整组缓存失效。
 * 启动时首页的查询多半已经先跑完了，不失效的话刚补出来的那几笔要等下一次刷新才看得见
 */
export async function generateDueAndRefresh(queryClient: QueryClient): Promise<void> {
  const created = await runDueRecurring();
  queryClient.invalidateQueries({ queryKey: RECURRING_KEY });
  if (created > 0) invalidateAll(queryClient);
}

/** 建规则（开始日期已到的话连第一笔一起记，见 createRecurringRule），所以交易那组缓存也要失效 */
export function useCreateRecurringRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ rule, first }: { rule: CreateRecurringInput; first: Parameters<typeof createRecurringRule>[1] }) =>
      createRecurringRule(rule, first),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RECURRING_KEY });
      invalidateAll(queryClient);
    },
  });
}

/** 不失效交易那组缓存：改规则不碰已经记上的账，那边没有东西要变 */
export function useUpdateRecurringRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateRecurringInput) => updateRecurringRule(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RECURRING_KEY });
      queryClient.invalidateQueries({ queryKey: ['localStats'] });
    },
  });
}

export function useSetRecurringActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setRecurringActive(id, active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: RECURRING_KEY }),
  });
}

export function useDeleteRecurringRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteRecurringRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RECURRING_KEY });
      // 备份卡上「未备份」的数要跟着变（软删的规则也要推一次）
      queryClient.invalidateQueries({ queryKey: ['localStats'] });
    },
  });
}
