import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { clearSearchHistory, getSearchHistory, pushSearchHistory } from '@/db/settings';

const SEARCH_HISTORY_KEY = ['searchHistory'];

/**
 * 搜索历史的读写。数据源是本地 app_settings 表，用 React Query 是为了一件具体的事：
 * 搜一次之后那份历史要立刻反映到下拉面板上，而下拉面板和「搜索」按钮是两个组件。
 * 走缓存失效比让页面自己 setState 再往下传一层干净。
 *
 * 两个写操作共用一个失效动作——它们改的是同一份列表。
 *
 * 没有"删掉其中一条"：面板上每个词都是一枚光秃秃的胶囊，删除的入口只有标题右边那个垃圾桶
 * （清空全部）。给每枚胶囊挂一个 × 会让这一片密密麻麻的小圆点变成一片密密麻麻的小叉，
 * 而历史记录本来就是会自己滚掉的东西——最多 10 条，搜几次错的词就被挤出去了。
 */
export function useSearchHistory() {
  return useQuery({ queryKey: SEARCH_HISTORY_KEY, queryFn: getSearchHistory });
}

export function useRecordSearch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (keyword: string) => pushSearchHistory(keyword),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SEARCH_HISTORY_KEY }),
  });
}

export function useClearSearchHistory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => clearSearchHistory(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SEARCH_HISTORY_KEY }),
  });
}
