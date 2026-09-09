import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createAccount, getAccountBalance, listAccounts } from '@/db/accounts';
import type { AccountType } from '@/db/accounts';

const ACCOUNTS_KEY = ['accounts'];

// 数据源是本地 SQLite，不是网络请求；用 React Query 单纯是为了拿它的缓存/loading/mutation 状态管理，
// 跟同步到服务器是两回事——同步是后续单独的功能
export function useAccounts() {
  return useQuery({
    queryKey: ACCOUNTS_KEY,
    queryFn: listAccounts,
  });
}

export function useAccountBalance(accountId: string) {
  return useQuery({
    queryKey: ['accountBalance', accountId],
    queryFn: () => getAccountBalance(accountId),
  });
}

export function useCreateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; type: AccountType; openingBalance?: number }) => createAccount(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY });
    },
  });
}
