import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Dimensions, FlatList, Keyboard, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TransactionDayCard } from '@/components/transaction/transaction-day-card';
import { TransactionDetailSheet } from '@/components/transaction/transaction-detail-sheet';
import { ModalHost } from '@/components/ui/modal-host';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { ScreenPadding, Spacing } from '@/constants/theme';
import { SearchFilterLabels, type SearchFilter } from '@/db/transactions';
import { useClearSearchHistory, useRecordSearch, useSearchHistory } from '@/hooks/use-search-history';
import { useSearchViewData } from '@/hooks/use-search-view-data';
import { useTheme } from '@/hooks/use-theme';
import { formatCurrency } from '@/utils/format';

/**
 * 下拉面板最高占屏幕多少。
 *
 * 留一截给底下的首页是**有意的**：这一层是从首页顶上垂下来的抽屉，不是一个新页面。
 * 看得见底下那一屏，人才知道"我还在首页、随时能退回去"；铺满整屏的话它跟一个页面
 * 就没有区别了，而这恰恰是这次改掉的东西（原先它真的是一个 push 进来的路由）。
 */
const PANEL_MAX_HEIGHT_RATIO = 0.52;

/** 界面上列出来的筛选条，顺序是"先分收支、再说报销、最后是例外" */
const SUGGESTION_FILTERS: SearchFilter[] = [
  'expense',
  'income',
  'reimbursable',
  'pendingReimbursement',
  'settledReimbursement',
  'excluded',
];

type SearchOverlayProps = {
  onDismiss: () => void;
};

/**
 * 首页顶上垂下来的搜索层。**不是一个路由**——点放大镜不跳页，就地展开。
 *
 * 为什么不开页面：搜索在这个 App 里是个"顺手看一眼"的动作（这笔星巴克上次多少钱来着），
 * 开一个页面意味着一次进栈、一次转场、一次返回，而它中间什么都没发生。
 * 抽屉式的好处是底下那一屏还在，关掉就回到原处，滚动位置也没丢。
 *
 * **输入框里的字和真正在搜的词是两个 state**，这是这一层唯一需要想清楚的事。
 * 即时搜索（边打边查）在这里是错的选择：本地库里搜一个常见字能命中几百条，
 * 列表会在打字过程中反复重排，而中间那几次结果没有任何人在看。
 * 点一下键盘上的「搜索」才提交，于是一次输入只查一次，历史也只记那个真正被搜的词。
 *
 * **两种形态，由"有没有发起过搜索"切换**：
 * - 还没搜 → 面板里是「历史搜索」和「搜索建议」两组胶囊，下面透出首页
 * - 搜过了 → 面板换成结果（顶上一张合计卡 + 按天分组的明细），占满剩下的高度
 *
 * 「搜索建议」那一组不是关键词，是**筛选条**：点「仅支出」就是列出全部支出。
 * 它跟输入框是 AND 的关系，所以"在支出里找星巴克"是打字 + 点一下的组合，不用学语法。
 */
export function SearchOverlay({ onDismiss }: SearchOverlayProps) {
  const theme = useTheme();

  // 输入框里正在敲的字
  const [keyword, setKeyword] = useState('');
  // 真正提交去查的那个词
  const [submitted, setSubmitted] = useState('');
  const [filter, setFilter] = useState<SearchFilter | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const data = useSearchViewData(submitted, filter);
  const { data: history } = useSearchHistory();
  const recordSearch = useRecordSearch();
  const clearHistory = useClearSearchHistory();

  const historyList = history ?? [];
  const panelMaxHeight = Dimensions.get('window').height * PANEL_MAX_HEIGHT_RATIO;

  const submit = (value: string) => {
    const trimmed = value.trim();
    // 空词 + 没选筛选条 = 这次"搜索"没有内容，不查也不记
    if (!trimmed && !filter) return;

    setKeyword(trimmed);
    setSubmitted(trimmed);
    Keyboard.dismiss();
    if (trimmed) recordSearch.mutate(trimmed);
  };

  // 点筛选条立刻生效，不用再按一次「搜索」：它本身就是一个完整的意图，
  // 而输入框里那几个字是不是打完了只有用户自己知道——两者要区别对待
  const toggleFilter = (next: SearchFilter) => {
    const value = filter === next ? null : next;
    setFilter(value);
    setSubmitted(keyword.trim());
    Keyboard.dismiss();
  };

  const reset = () => {
    setKeyword('');
    setSubmitted('');
    setFilter(null);
  };

  return (
    <ModalHost visible animation="fade" onRequestClose={onDismiss}>
      <View style={styles.root}>
        {/* 顶上这一块铺页面底色、不透明：它盖住的是首页的标题行和月度卡片，
            半透明会让两层文字叠在一起，什么都读不了 */}
        <SafeAreaView edges={['top']} style={{ backgroundColor: theme.background }}>
          <View style={styles.bar}>
            <View style={[styles.field, { backgroundColor: theme.backgroundElement }]}>
              <Ionicons name="search" size={18} color={theme.textSecondary} />
              <TextInput
                value={keyword}
                onChangeText={setKeyword}
                onSubmitEditing={() => submit(keyword)}
                placeholder=""
                placeholderTextColor={theme.textSecondary}
                // 键盘右下角那个键写「搜索」而不是「换行」——它执行的就是同一件事
                returnKeyType="search"
                autoFocus
                style={[styles.input, { color: theme.text }]}
              />
              {keyword.length > 0 ? (
                <Pressable onPress={reset} hitSlop={8}>
                  <Ionicons name="close-circle" size={17} color={theme.textSecondary} />
                </Pressable>
              ) : null}
            </View>

            {/* 大叉在输入框**外面**：它关的是整层，不是清空输入。
                两个动作长得像但后果差很远，所以不放在同一个容器里 */}
            <Pressable onPress={onDismiss} hitSlop={10} style={styles.closeButton}>
              <Ionicons name="close" size={26} color={theme.text} />
            </Pressable>
          </View>

          {!data.hasQuery ? (
            <ScrollView
              style={{ maxHeight: panelMaxHeight }}
              contentContainerStyle={styles.panel}
              keyboardShouldPersistTaps="handled">
              {historyList.length > 0 ? (
                <View style={styles.section}>
                  <View style={styles.sectionHead}>
                    <ThemedText style={styles.sectionTitle}>历史搜索</ThemedText>
                    <Pressable onPress={() => clearHistory.mutate()} hitSlop={10}>
                      <Ionicons name="trash-outline" size={19} color={theme.textSecondary} />
                    </Pressable>
                  </View>
                  <View style={styles.chips}>
                    {historyList.map((item) => (
                      <Chip key={item} label={item} onPress={() => submit(item)} />
                    ))}
                  </View>
                </View>
              ) : null}

              <View style={styles.section}>
                <ThemedText style={styles.sectionTitle}>搜索建议</ThemedText>
                <View style={styles.chips}>
                  {SUGGESTION_FILTERS.map((key) => (
                    <Chip
                      key={key}
                      label={SearchFilterLabels[key]}
                      active={filter === key}
                      onPress={() => toggleFilter(key)}
                    />
                  ))}
                </View>
              </View>
            </ScrollView>
          ) : null}
        </SafeAreaView>

        {data.hasQuery ? (
          <View style={[styles.results, { backgroundColor: theme.background }]}>
            {/* 选中的筛选条要一直看得见：结果只有三条的时候，人第一个想问的是
                "是真的只有三条，还是我刚才点了什么"。这一行就是那个答案 */}
            {filter ? (
              <View style={styles.activeFilterRow}>
                <Pressable
                  onPress={() => toggleFilter(filter)}
                  style={[styles.activeFilter, { backgroundColor: theme.cardHighlight }]}>
                  <ThemedText style={[styles.activeFilterText, { color: theme.onCardHighlight }]}>
                    {SearchFilterLabels[filter]}
                  </ThemedText>
                  <Ionicons name="close" size={13} color={theme.onCardHighlight} />
                </Pressable>
              </View>
            ) : null}

            {data.count === 0 ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                {data.isLoading ? '搜索中…' : '没有找到符合条件的账单。'}
              </ThemedText>
            ) : (
              <FlatList
                data={data.dayGroups}
                keyExtractor={(group) => group.key}
                contentContainerStyle={styles.listContent}
                keyboardShouldPersistTaps="handled"
                ListHeaderComponent={
                  <ThemedView type="backgroundElement" style={styles.summary}>
                    <ThemedText type="small" themeColor="textSecondary">
                      找到 {data.count} 笔
                    </ThemedText>
                    <View style={styles.summaryTotals}>
                      <ThemedText style={styles.summaryValue}>支出 {formatCurrency(data.expense)}</ThemedText>
                      {data.income > 0 ? (
                        <ThemedText style={styles.summaryValue}>收入 {formatCurrency(data.income)}</ThemedText>
                      ) : null}
                    </View>
                    {/* 命中太多被截断时说一声。不做分页——再多打两个字比翻页快（见 searchTransactions） */}
                    {data.isTruncated ? (
                      <ThemedText type="small" themeColor="textSecondary">
                        结果较多，只列出最近的 {data.count} 笔。再多打几个字能找得更准。
                      </ThemedText>
                    ) : null}
                  </ThemedView>
                }
                renderItem={({ item }) => (
                  <View style={styles.groupWrap}>
                    <TransactionDayCard group={item} onSelect={setDetailId} />
                  </View>
                )}
              />
            )}
          </View>
        ) : (
          // 还没搜的时候，面板底下压着的首页要能看见（这一层是抽屉不是页面），
          // 但得压暗一档，否则两屏文字挤在一起分不清哪层是活的。点它就收起来
          <Pressable style={styles.scrim} onPress={onDismiss} />
        )}
      </View>

      {/* 详情层挂在搜索层**里面**：RN 的 Modal 是独立的原生窗口，
          挂在外面的话它会被这一层盖住，点一行账单什么都不会发生 */}
      {detailId ? (
        <TransactionDetailSheet transactionId={detailId} onDismiss={() => setDetailId(null)} />
      ) : null}
    </ModalHost>
  );
}

// 历史和建议共用同一枚胶囊：它们在界面上是同一种东西（点一下就搜），
// 只是一个来自你自己打过的字、一个来自预设条件。选中态只有建议那组用得上
function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: active ? theme.cardHighlight : theme.backgroundSelected },
      ]}>
      <ThemedText
        numberOfLines={1}
        style={[styles.chipText, active ? { color: theme.onCardHighlight } : null]}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: ScreenPadding,
    paddingTop: 6,
    paddingBottom: 10,
  },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    // 圆角矩形不是胶囊：参考界面上这个框是方的，圆到底会让它看起来像一枚很长的标签
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  input: {
    flex: 1,
    // padding 归零：Android 的 TextInput 自带一圈内距，不清掉光标会偏在框的上半部
    padding: 0,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
  closeButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: {
    paddingHorizontal: ScreenPadding,
    paddingBottom: 18,
    gap: 18,
  },
  section: {
    gap: 12,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '700',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 15,
    paddingVertical: 8,
    // 一条特别长的历史不许把整行撑破，多的用省略号
    maxWidth: '100%',
  },
  chipText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '500',
  },
  scrim: {
    flex: 1,
    // 只压一档，不是对话框那种深遮罩：底下那一屏要还看得见，
    // 它在这里的作用是"提醒你上面那层才是活的"，不是"把它藏起来"
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  results: {
    flex: 1,
  },
  activeFilterRow: {
    flexDirection: 'row',
    paddingHorizontal: ScreenPadding,
    paddingBottom: 8,
  },
  activeFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  activeFilterText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: ScreenPadding,
    paddingBottom: Spacing.six,
  },
  summary: {
    borderRadius: 16,
    padding: 16,
    gap: 6,
    marginBottom: 10,
  },
  summaryTotals: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  summaryValue: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  groupWrap: {
    marginBottom: 10,
  },
  empty: {
    paddingHorizontal: ScreenPadding,
    paddingTop: 20,
  },
});
