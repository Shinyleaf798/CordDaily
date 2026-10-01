import type { SearchFilter, TransactionWithCategory } from '@/db/transactions';
import { useSearchTransactions } from '@/hooks/use-transactions';
import { groupTransactionsByMonth, type TransactionMonthGroup } from '@/utils/transaction-view';

/** 跟 db/transactions.ts 里 searchTransactions 的默认 limit 对齐。超过这个数界面上要说一声 */
const SEARCH_RESULT_LIMIT = 200;

export type SearchViewData = {
  /** 命中的笔数。到了上限时它就是上限本身，界面靠 isTruncated 说明这一点 */
  count: number;
  expense: number;
  income: number;
  /** 命中结果是不是被截断了。是的话界面提示"再多打两个字" */
  isTruncated: boolean;
  /**
   * **按月分堆，不是按天**——搜索是全 App 唯一这样做的页面。
   *
   * 一次搜索能横跨好几年，按天分就是一堆各含一行的卡片，每张顶上还挂一条等于那一行本身的
   * "当天小计"；而且卡上只写「9月10日」，2024 和 2026 的两笔月卡看起来一模一样。
   * 按月之后每张卡顶着「2026年8月」，年份是分节标题自带的，行里只剩日号。
   * 详见 utils/transaction-view.ts 的 groupTransactionsByMonth。
   */
  monthGroups: TransactionMonthGroup[];
};

/**
 * 搜索结果的派生。
 *
 * 合计**不跳过 excludeFromStats**，跟每天的小计保持一致：搜出来的是一批具体的账，
 * 顶上那两个数回答的是"这批账一共多少钱"，不是"这批账占了多少预算"。
 * 统计口径那件事有统计页负责（见 utils/transaction-view 里同一条规矩）。
 */
// `now` 没了：按月分堆不需要"今天/昨天"那套相对说法，所以这个派生现在跟"几点钟调用的"无关
export function buildSearchViewData(input: { results?: TransactionWithCategory[] }): SearchViewData {
  const { results } = input;
  const rows = results ?? [];

  return {
    count: rows.length,
    expense: rows.filter((t) => t.type === 'EXPENSE').reduce((sum, t) => sum + t.amountInBase, 0),
    income: rows.filter((t) => t.type === 'INCOME').reduce((sum, t) => sum + t.amountInBase, 0),
    isTruncated: rows.length >= SEARCH_RESULT_LIMIT,
    monthGroups: groupTransactionsByMonth(rows),
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
    ...buildSearchViewData({ results }),
    // isFetching 而不是 isLoading：同一个词第二次搜时缓存里已经有数据，
    // isLoading 是 false 但后台在重查，这时候不该把列表换成转圈
    isLoading: isFetching,
    // 「有没有发起过搜索」跟「搜到了几条」是两回事：没搜过要显示历史面板，
    // 搜过但一条没有要显示"没找到"。少了这个标记，两种情况在界面上长得一样
    hasQuery: submittedKeyword.trim().length > 0 || filter !== null,
  };
}
