import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createTransaction,
  deleteTransaction,
  duplicateTransaction,
  getMonthSummary,
  getTransaction,
  getPendingReimbursementTotal,
  getTagBreakdown,
  listReimbursements,
  listMonthTransactions,
  listRecentTransactions,
  listTagSummaries,
  setReimbursed,
  suggestFieldValues,
  updateTransaction,
  type CreateTransactionInput,
  type SuggestionField,
  type UpdateTransactionInput,
} from '@/db/transactions';
import { formatMonthKey } from '@/utils/date';

// 数据源是本地 SQLite，不是网络请求；用 React Query 单纯是为了缓存和 mutation 状态管理（同 use-accounts）
const TRANSACTIONS_KEY = ['transactions'];

// 一笔交易会同时影响账单列表、月度汇总、标签汇总、报销清单和账户余额，
// 所以写入后统一把这几组缓存全部失效，而不是逐个挑——挑漏了就会出现"记了一笔但首页数字没变"
function invalidateAll(queryClient: ReturnType<typeof useQueryClient>) {
  const keys = [
    TRANSACTIONS_KEY,
    ['monthSummary'],
    ['budgetStatus'],
    ['tagSummaries'],
    ['tagBreakdown'],
    ['reimbursements'],
    ['accountBalance'],
  ];
  for (const key of keys) {
    queryClient.invalidateQueries({ queryKey: key });
  }
}

export function useRecentTransactions(days = 7) {
  return useQuery({
    queryKey: [...TRANSACTIONS_KEY, 'recent', days],
    queryFn: () => listRecentTransactions(days),
  });
}

// 日历页要的是某个月的全部明细（不是汇总数字），按月缓存：
// 来回切月份时看过的月份直接命中缓存，不会每次都重新打库
export function useMonthTransactions(date: Date) {
  return useQuery({
    queryKey: [...TRANSACTIONS_KEY, 'month', formatMonthKey(date)],
    queryFn: () => listMonthTransactions(date),
  });
}

export function useMonthSummary(date?: Date) {
  const monthKey = formatMonthKey(date ?? new Date());
  return useQuery({
    queryKey: ['monthSummary', monthKey],
    queryFn: () => getMonthSummary(date),
  });
}

/** 单笔详情。id 为空时不查——详情弹层关着的时候没必要打库 */
export function useTransaction(id: string | null | undefined) {
  return useQuery({
    queryKey: [...TRANSACTIONS_KEY, 'detail', id],
    queryFn: () => getTransaction(id!),
    enabled: !!id,
  });
}

export function useCreateTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTransactionInput) => createTransaction(input),
    onSuccess: () => invalidateAll(queryClient),
  });
}

// 改、复制、删都跟新增一样会牵动首页列表、月度汇总、预算、标签和账户余额，
// 所以统一走 invalidateAll，不逐个挑——挑漏了就是"改完数字没变"这类查不出来的 bug
export function useUpdateTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateTransactionInput) => updateTransaction(input),
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useDuplicateTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => duplicateTransaction(id),
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTransaction(id),
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useTagSummaries() {
  return useQuery({ queryKey: ['tagSummaries'], queryFn: listTagSummaries });
}

export function useTagBreakdown(tag: string | null) {
  return useQuery({
    queryKey: ['tagBreakdown', tag],
    queryFn: () => getTagBreakdown(tag!),
    enabled: !!tag,
  });
}

export function useReimbursements(settled: boolean) {
  return useQuery({
    queryKey: ['reimbursements', settled],
    queryFn: () => listReimbursements(settled),
  });
}

export function usePendingReimbursementTotal() {
  return useQuery({ queryKey: ['reimbursements', 'pendingTotal'], queryFn: getPendingReimbursementTotal });
}

export function useSetReimbursed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reimbursed }: { id: string; reimbursed: boolean }) => setReimbursed(id, reimbursed),
    onSuccess: () => invalidateAll(queryClient),
  });
}

// 店名/地点的历史补全。enabled 关掉输入框没聚焦时的查询，避免每敲一个字都打一次库
export function useFieldSuggestions(field: SuggestionField, keyword: string, enabled = true) {
  return useQuery({
    queryKey: ['fieldSuggestions', field, keyword.trim()],
    queryFn: () => suggestFieldValues(field, keyword),
    enabled,
    staleTime: 60_000,
  });
}
