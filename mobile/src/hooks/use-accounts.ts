import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  countAccountTransactions,
  createAccount,
  deleteAccount,
  getDefaultAccountId,
  getLastUsedAccountId,
  listAccountBalances,
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
 * 一次拿到所有账户 + 各自的余额。资产页的分组小计和总资产都从这一份算。
 *
 * queryKey 挂在 `['accountBalance', ...]` 而不是 `['accounts', ...]` 下面，是**故意**的：
 * 余额会被记账改变，而 use-transactions 的 invalidateAll 里失效的正是 `['accountBalance']`。
 * 挂到 accounts 下面的话，记完一笔账资产页的数字不会变——那种 bug 很难联想到缓存 key 上。
 */
export function useAccountBalances() {
  return useQuery({ queryKey: ['accountBalance', 'all'], queryFn: listAccountBalances });
}

export function useUpdateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateAccount,
    onSuccess: () => {
      // 改了期初余额或名字，余额和列表都要重算
      queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY });
      queryClient.invalidateQueries({ queryKey: ['accountBalance'] });
    },
  });
}

export function useCreateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAccountInput) => createAccount(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY });
      // 新账户带着期初余额进来，总资产会变——原先漏了这一条
      queryClient.invalidateQueries({ queryKey: ['accountBalance'] });
    },
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
// 每个账户的余额都要重算（钱挪到别的账户名下了），账单缓存里存着旧的 accountId，
// 详情弹层显示的账户名也来自那份缓存
export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (accountId: string) => deleteAccount(accountId),
    onSuccess: () => {
      for (const key of [ACCOUNTS_KEY, ['accountBalance'], ['transactions'], ['accountTransactionCount']]) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}

/** 兜底账户（「不选择任何账户」）的 id。界面靠它判断哪一行不给删除按钮 */
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
