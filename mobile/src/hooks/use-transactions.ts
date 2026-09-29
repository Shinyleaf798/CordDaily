import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createTransaction,
  deleteTransaction,
  duplicateTransaction,
  getMonthSummary,
  getTransaction,
  getPendingReimbursementTotal,
  getTagBreakdown,
  listCategorySpending,
  listCategoryTransactions,
  listMonthlyExpense,
  listReimbursements,
  listMonthTransactions,
  listRecentTransactions,
  listTagSummaries,
  listTransactionsInRange,
  searchTransactions,
  setReimbursed,
  suggestFieldValues,
  updateTransaction,
  type CreateTransactionInput,
  type SearchFilter,
  type SuggestionField,
  type TransactionType,
  type UpdateTransactionInput,
} from '@/db/transactions';
import { formatMonthKey } from '@/utils/date';

// 数据源是本地 SQLite，不是网络请求；用 React Query 单纯是为了缓存和 mutation 状态管理（同 use-accounts）
const TRANSACTIONS_KEY = ['transactions'];

// 一笔交易会同时影响账单列表、月度汇总、分类构成、标签汇总和报销清单，
// 所以写入后统一把这几组缓存全部失效，而不是逐个挑——挑漏了就会出现"记了一笔但首页数字没变"
function invalidateAll(queryClient: ReturnType<typeof useQueryClient>) {
  const keys = [
    TRANSACTIONS_KEY,
    ['monthSummary'],
    ['budgetStatus'],
    ['categorySpending'],
    ['monthlyExpense'],
    ['tagSummaries'],
    ['tagBreakdown'],
    ['reimbursements'],
    // 「我的」页那张备份卡上的三个数（本地账单 / 未备份 / 上次备份）也是交易的衍生值。
    // 漏了它的表现特别隐蔽：那一页是 tab，删完账单回来它**没有重新挂载**，
    // 于是一直显示删除前的数字，看起来像"删除没生效"
    ['localStats'],
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

/**
 * 任意一段时间里的全部交易。账单预览页（总 / 年 / 月 / 周）用它。
 *
 * queryKey 里放的是 ISO 字符串而不是 Date 对象：React Query 比较 key 用的是深比较，
 * 两个值相等的 Date 能比对，但每次渲染都 new 一个出来会让 key 在引用层面不停地变，
 * 读起来也没法一眼看出缓存里存的是哪一段。`null` 表示这一头不设限（「总」那一档）。
 */
export function useTransactionsInRange(start: Date | null, end: Date | null) {
  return useQuery({
    queryKey: [...TRANSACTIONS_KEY, 'range', start?.toISOString() ?? 'all', end?.toISOString() ?? 'all'],
    queryFn: () => listTransactionsInRange(start, end),
  });
}

/**
 * 搜账单。关键词和筛选条**两个都空**的时候不查——面板刚展开时就是这个状态，
 * 没必要为了一个还没输入的词把整本账捞出来。
 *
 * queryKey 里是**已提交**的那个词，不是输入框里正在敲的字：
 * 这个 App 的搜索是点一下键盘上那个「搜索」才执行的（见 components/search/search-overlay.tsx），
 * 每敲一个字就查一次会让几百条结果的列表在打字过程中反复重排。
 */
export function useSearchTransactions(keyword: string, filter: SearchFilter | null) {
  const trimmed = keyword.trim();
  return useQuery({
    queryKey: [...TRANSACTIONS_KEY, 'search', trimmed, filter ?? 'none'],
    queryFn: () => searchTransactions(trimmed, filter),
    enabled: trimmed.length > 0 || filter !== null,
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

// 改、复制、删都跟新增一样会牵动首页列表、月度汇总、预算、分类构成和标签，
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

// 按月缓存，跟 useMonthTransactions 同一个路子：来回切月份时看过的月份直接命中缓存
export function useCategorySpending(date?: Date) {
  const monthKey = formatMonthKey(date ?? new Date());
  return useQuery({
    queryKey: ['categorySpending', monthKey],
    queryFn: () => listCategorySpending(date),
  });
}

/** 趋势图：截止到 endMonth 的最近几个月，各月支出合计 */
export function useMonthlyExpense(endMonth: Date, months = 6) {
  return useQuery({
    queryKey: ['monthlyExpense', formatMonthKey(endMonth), months],
    queryFn: () => listMonthlyExpense(endMonth, months),
  });
}

/** 某个顶层分类（含子分类）在某个月的账单明细。分类下钻页用 */
export function useCategoryTransactions(categoryId: string | null | undefined, date?: Date) {
  return useQuery({
    queryKey: [...TRANSACTIONS_KEY, 'category', categoryId, formatMonthKey(date ?? new Date())],
    queryFn: () => listCategoryTransactions(categoryId!, date),
    enabled: !!categoryId,
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
export function useFieldSuggestions(
  field: SuggestionField,
  keyword: string,
  type: TransactionType,
  enabled = true,
) {
  return useQuery({
    // type 要进 key：同一个关键词在支出和收入下是两套结果，共用一个 key 会互相串
    queryKey: ['fieldSuggestions', field, type, keyword.trim()],
    queryFn: () => suggestFieldValues(field, keyword, type),
    enabled,
    staleTime: 60_000,
  });
}
