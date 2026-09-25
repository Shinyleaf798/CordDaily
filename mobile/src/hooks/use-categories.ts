import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  countCategoryUsage,
  createCategory,
  deleteCategory,
  dismissCategoryTip,
  isCategoryTipDismissed,
  listCategoriesByType,
  moveCategory,
  reorderCategories,
  setCategoryActive,
  updateCategory,
  type Category,
  type CategoryType,
} from '@/db/categories';

const CATEGORIES_KEY = ['categories'];

const categoriesKey = (type: CategoryType) => [...CATEGORIES_KEY, type];

// 分类是本地表，首次启动由 _layout 的 seedDefaultCategories 灌入默认那批（带真 UUID）。
// 返回的是**全部**分类（含已停用的），按 sortOrder 排好。
// 过滤停用的那一步交给调用方：管理页要看见停用的，记账页不要——
// 在这里就滤掉的话，管理页得再开一个查询，同一份数据在缓存里存两份
export function useCategories(type: CategoryType) {
  return useQuery({
    queryKey: categoriesKey(type),
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
    mutationFn: (input: { name: string; type: CategoryType; icon?: string | null; parentId?: string | null }) =>
      createCategory(input),
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

/** 停用 / 启用。停用的分类不出现在记账页的网格里，但它名下的账单一条不动 */
export function useSetCategoryActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) => setCategoryActive(input.id, input.isActive),
    onSuccess: () => invalidateCategoryConsumers(queryClient),
  });
}

/** 换一层：parentId 传 null 是升成一级分类，传 id 是挂到那个一级分类下面 */
export function useMoveCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; parentId: string | null }) => moveCategory(input.id, input.parentId),
    onSuccess: () => invalidateCategoryConsumers(queryClient),
  });
}

/**
 * 拖动排序。`orderedIds` 是拖完之后那一层完整的 id 顺序。
 *
 * onMutate 里先把缓存改成新顺序：手指一松，列表必须**立刻**停在新位置。
 * 只等写库 + 失效 + 重查的话，中间那几十毫秒列表会先弹回原样再跳到新位置，
 * 看起来就像"拖动没生效，过一会儿才自己动了一下"。
 * 写库失败时 onError 把快照放回去，用户看到的顺序永远跟库里一致。
 */
export function useReorderCategories() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { type: CategoryType; orderedIds: string[] }) => reorderCategories(input.orderedIds),
    onMutate: async ({ type, orderedIds }) => {
      const key = categoriesKey(type);
      // 取消在途的查询：它带着旧顺序，回来晚了会盖掉下面这次乐观更新
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Category[]>(key);
      if (previous) {
        queryClient.setQueryData<Category[]>(key, applyOrder(previous, orderedIds));
      }
      return { key, previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(context.key, context.previous);
    },
    onSettled: () => invalidateCategoryConsumers(queryClient),
  });
}

/**
 * 把 orderedIds 里那几条按新次序排好，其余行（子分类、另一层的）原样留着。
 *
 * 不是整个数组重排：传进来的只有被拖的那一层（目前是一级分类），
 * 子分类不在 orderedIds 里，硬排会把它们全挤到末尾，展开时顺序就乱了。
 */
function applyOrder(rows: Category[], orderedIds: string[]): Category[] {
  const rank = new Map(orderedIds.map((id, index) => [id, index]));
  const moved = rows.filter((row) => rank.has(row.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  let cursor = 0;
  return rows.map((row) => (rank.has(row.id) ? moved[cursor++] : row));
}

/**
 * 管理页顶上那条操作提示。关掉之后写进本地设置表，不再出现。
 *
 * 没做乐观更新：点 ✕ 到它消失之间只隔一次本地 SQLite 写入，
 * 而这条提示本来就不是用户盯着看的东西，晚一帧收起来察觉不到。
 */
export function useCategoryTip() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: CATEGORY_TIP_KEY, queryFn: isCategoryTipDismissed });
  const dismiss = useMutation({
    mutationFn: dismissCategoryTip,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATEGORY_TIP_KEY }),
  });

  return {
    // 还没查出来时当作"已关掉"：猜错的代价不对称——该显示却没显示，
    // 只是少看一眼提示；不该显示却闪一下，是每次进页面都要被打扰一帧
    visible: query.data === false,
    dismiss: () => dismiss.mutate(),
  };
}

const CATEGORY_TIP_KEY = ['categoryTipDismissed'];

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
