import { useQuery } from '@tanstack/react-query';

import { listCategoriesByType, type CategoryType } from '@/db/categories';

// 分类是本地表，首次启动由 _layout 的 seedDefaultCategories 灌入默认那批（带真 UUID）
export function useCategories(type: CategoryType) {
  return useQuery({
    queryKey: ['categories', type],
    queryFn: () => listCategoriesByType(type),
  });
}
