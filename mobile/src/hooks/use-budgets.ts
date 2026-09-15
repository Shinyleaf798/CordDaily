import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getBudgetStatus, listBudgets, upsertBudget } from '@/db/budgets';

export function useBudgets() {
  return useQuery({ queryKey: ['budgets'], queryFn: listBudgets });
}

export function useBudgetStatus(date?: Date) {
  const monthKey = (date ?? new Date()).toISOString().slice(0, 7);
  return useQuery({
    queryKey: ['budgetStatus', monthKey],
    queryFn: () => getBudgetStatus(date),
  });
}

export function useUpsertBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ categoryId, amount }: { categoryId: string; amount: number }) => upsertBudget(categoryId, amount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      queryClient.invalidateQueries({ queryKey: ['budgetStatus'] });
    },
  });
}
