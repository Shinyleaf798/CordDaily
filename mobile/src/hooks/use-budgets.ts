import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getBudgetStatus, getOverallBudget, setOverallBudget } from '@/db/budgets';
import { formatMonthKey } from '@/utils/date';

export function useBudgetStatus(date?: Date) {
  const monthKey = formatMonthKey(date ?? new Date());
  return useQuery({
    queryKey: ['budgetStatus', monthKey],
    queryFn: () => getBudgetStatus(date),
  });
}

export function useOverallBudget() {
  return useQuery({ queryKey: ['overallBudget'], queryFn: getOverallBudget });
}

// 预算一改，首页的进度、日均消费、剩余每日可消费全都要跟着变，所以连 budgetStatus 一起失效
export function useSetOverallBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (amount: number) => setOverallBudget(amount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['overallBudget'] });
      queryClient.invalidateQueries({ queryKey: ['budgetStatus'] });
    },
  });
}
