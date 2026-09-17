import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  countCategoryUsage,
  createCategory,
  deleteCategory,
  listCategoriesByType,
  updateCategory,
  type CategoryType,
} from '@/db/categories';

const CATEGORIES_KEY = ['categories'];

// 分类是本地表，首次启动由 _layout 的 seedDefaultCategories 灌入默认那批（带真 UUID）
export function useCategories(type: CategoryType) {
  return useQuery({
    queryKey: [...CATEGORIES_KEY, type],
    queryFn: () => listCategoriesByType(type),
  });
}

// 改了分类名/图标，账单列表里显示的分类名和图标也跟着变（列表是 JOIN categories 查出来的），
// 所以这三个写操作都要连 transactions 那组缓存一起失效，不能只刷分类自己
function invalidateCategoryConsumers(queryClient: ReturnType<typeof useQueryClient>) {
  for (const key of [CATEGORIES_KEY, ['transactions'], ['categoryUsage']]) {
    queryClient.invalidateQueries({ queryKey: key });
  }
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; type: CategoryType; icon?: string | null }) => createCategory(input),
    onSuccess: () => invalidateCategoryConsumers(queryClient),
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; name: string; icon: string | null }) => updateCategory(input),
    onSuccess: () => invalidateCategoryConsumers(queryClient),
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => invalidateCategoryConsumers(queryClient),
  });
}

/**
 * 每个分类被多少笔记录引用着。管理页一次性把整页的数量查出来，
 * 而不是每行挂一个查询——20 个分类就是 20 次查询，而这个数只是用来决定"删除"按钮灰不灰。
 */
export function useCategoryUsage(ids: string[]) {
  return useQuery({
    queryKey: ['categoryUsage', ids.join(',')],
    queryFn: async () => {
      const entries = await Promise.all(ids.map(async (id) => [id, await countCategoryUsage(id)] as const));
      return Object.fromEntries(entries) as Record<string, number>;
    },
    enabled: ids.length > 0,
  });
}
