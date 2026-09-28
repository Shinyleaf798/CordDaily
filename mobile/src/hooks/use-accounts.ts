import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  countAccountTransactions,
  createAccount,
  deleteAccount,
  getDefaultAccountId,
  getLastUsedAccountId,
  listAccounts,
  updateAccount,
} from '@/db/accounts';
import type { CreateAccountInput } from '@/db/accounts';

const ACCOUNTS_KEY = ['accounts'];

// 数据源是本地 SQLite，不是网络请求；用 React Query 单纯是为了拿它的缓存/loading/mutation 状态管理，
// 跟同步到服务器是两回事——同步是后续单独的功能
export function useAccounts() {
  return useQuery({
    queryKey: ACCOUNTS_KEY,
    queryFn: listAccounts,
  });
}

/**
 * 一次账户写操作会牵动谁。跟 use-categories 的同名函数是同一件事、同一个理由：
 * 账户的增删改都会改变"还有多少东西没备份"（新建的 synced 是 0，改名会把它置回 0，
 * 删除留一块墓碑），而「我的」页是 tab、不会重新挂载——不失效 `localStats` 的话，
 * 那张备份卡会一直停在改动前的数字，点进备份层也看不到「要上传的账户」。
 */
function invalidateAccountConsumers(queryClient: ReturnType<typeof useQueryClient>, extra: string[][] = []) {
  for (const key of [ACCOUNTS_KEY, ['localStats'], ['pendingDeletions'], ...extra]) {
    queryClient.invalidateQueries({ queryKey: key });
  }
}

export function useUpdateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateAccount,
    onSuccess: () => invalidateAccountConsumers(queryClient),
  });
}

export function useCreateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAccountInput) => createAccount(input),
    onSuccess: () => invalidateAccountConsumers(queryClient),
  });
}

/** 确认框里那句"有 N 笔账单会转过去"。id 为空时不查——框没开着没必要打库 */
export function useAccountTransactionCount(accountId: string | null | undefined) {
  return useQuery({
    queryKey: ['accountTransactionCount', accountId],
    queryFn: () => countAccountTransactions(accountId!),
    enabled: !!accountId,
  });
}

// 删账户会连带把它名下的账单改指到默认账户，所以要失效的不止账户列表：
// 账单缓存里存着旧的 accountId，详情弹层显示的账户名也来自那份缓存
export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (accountId: string) => deleteAccount(accountId),
    onSuccess: () => invalidateAccountConsumers(queryClient, [['transactions'], ['accountTransactionCount']]),
  });
}

/** 兜底账户（「不选择任何账户」）的 id。账户编辑页靠它判断这一行给不给删除按钮 */
export function useDefaultAccountId() {
  return useQuery({ queryKey: [...ACCOUNTS_KEY, 'default'], queryFn: getDefaultAccountId });
}

/**
 * 上次记账用的账户，记账页拿它当默认值。
 *
 * queryKey 挂在 transactions 下面而不是 accounts 下面：它的答案随**记账**变化，
 * 而 use-transactions 的 invalidateAll 会把 ['transactions'] 整棵失效掉——
 * 于是记完一笔，下一次打开记账页拿到的就是刚用过的那个账户，这里不用额外做任何事
 */
export function useLastUsedAccountId() {
  return useQuery({ queryKey: ['transactions', 'lastUsedAccount'], queryFn: getLastUsedAccountId });
}
