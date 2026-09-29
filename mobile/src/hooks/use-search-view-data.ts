import type { SearchFilter, TransactionWithCategory } from '@/db/transactions';
import { useSearchTransactions } from '@/hooks/use-transactions';
import { groupTransactionsByDay, type TransactionDayGroup } from '@/utils/transaction-view';

/** 跟 db/transactions.ts 里 searchTransactions 的默认 limit 对齐。超过这个数界面上要说一声 */
const SEARCH_RESULT_LIMIT = 200;

export type SearchViewData = {
  /** 命中的笔数。到了上限时它就是上限本身，界面靠 isTruncated 说明这一点 */
  count: number;
  expense: number;
  income: number;
  /** 命中结果是不是被截断了。是的话界面提示"再多打两个字" */
  isTruncated: boolean;
  dayGroups: TransactionDayGroup[];
};

/**
 * 搜索结果的派生。
 *
 * 合计**不跳过 excludeFromStats**，跟每天的小计保持一致：搜出来的是一批具体的账，
 * 顶上那两个数回答的是"这批账一共多少钱"，不是"这批账占了多少预算"。
 * 统计口径那件事有统计页负责（见 utils/transaction-view 里同一条规矩）。
 */
export function buildSearchViewData(input: { now: Date; results?: TransactionWithCategory[] }): SearchViewData {
  const { now, results } = input;
  const rows = results ?? [];

  return {
    count: rows.length,
    expense: rows.filter((t) => t.type === 'EXPENSE').reduce((sum, t) => sum + t.amountInBase, 0),
    income: rows.filter((t) => t.type === 'INCOME').reduce((sum, t) => sum + t.amountInBase, 0),
    isTruncated: rows.length >= SEARCH_RESULT_LIMIT,
    dayGroups: groupTransactionsByDay(rows, now),
  };
}

/**
 * 搜索面板取数：一个查询 + 一次派生。
 *
 * 传进来的是**已提交**的关键词和筛选条。输入框里正在敲的那个字由面板自己拿 state 存着，
 * 两者分开是这个搜索交互的核心（见 components/search/search-overlay.tsx 顶上的说明）。
 */
export function useSearchViewData(
  submittedKeyword: string,
  filter: SearchFilter | null,
): SearchViewData & { isLoading: boolean; hasQuery: boolean } {
  const { data: results, isFetching } = useSearchTransactions(submittedKeyword, filter);

  return {
    ...buildSearchViewData({ now: new Date(), results }),
    // isFetching 而不是 isLoading：同一个词第二次搜时缓存里已经有数据，
    // isLoading 是 false 但后台在重查，这时候不该把列表换成转圈
    isLoading: isFetching,
    // 「有没有发起过搜索」跟「搜到了几条」是两回事：没搜过要显示历史面板，
    // 搜过但一条没有要显示"没找到"。少了这个标记，两种情况在界面上长得一样
    hasQuery: submittedKeyword.trim().length > 0 || filter !== null,
  };
}
