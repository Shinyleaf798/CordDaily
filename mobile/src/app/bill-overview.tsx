import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BillFilterSheet } from '@/components/bill/bill-filter-sheet';
import { BillHeader } from '@/components/bill/bill-header';
import { BillSummaryCard } from '@/components/bill/bill-summary-card';
import { BillSummaryTable } from '@/components/bill/bill-summary-table';
import { BillTabBar, type BillTab } from '@/components/bill/bill-tab-bar';
import { BillTagList } from '@/components/bill/bill-tag-list';
import { BillTrendChart } from '@/components/bill/bill-trend-chart';
import { CategoryDonut } from '@/components/bill/category-donut';
import { CategoryStatList } from '@/components/bill/category-stat-list';
import { TransactionDayCard } from '@/components/transaction/transaction-day-card';
import { TransactionDetailSheet } from '@/components/transaction/transaction-detail-sheet';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { ScreenPadding, Spacing } from '@/constants/theme';
import {
  billPeriodForScope,
  shiftBillPeriod,
  useBillOverviewData,
  type BillPeriod,
  type BillScope,
  type BillTrendMetric,
  type BillTypeFilter,
} from '@/hooks/use-bill-overview-data';
import { useTheme } from '@/hooks/use-theme';

/**
 * 账单预览：`/bill-overview`。首页标题右边那个饼图进来。
 *
 * 跟统计 tab 的分工（这一页存在的理由）：
 * 统计页是**本月这一屏**——打开就看本月花了多少、比上月多还是少、钱去了哪几类，
 * 每一块都只列前几名，看完就走。这一页是**翻账本**：时间段自己选（总/年/月/周），
 * 汇总表按下一级粒度整段列出来，分类和标签全列不折叠，底下接着全部明细。
 * 一个回答"最近怎么样"，一个回答"那一段到底是什么情况"。
 *
 * **导航栏整条关掉，顶上两行自己画**（见 BillHeader）：系统导航栏中间只放得下一个标题，
 * 而这一页最该占住那个位置的是 总/年/月/周 那排控件。
 *
 * 页面自己管五个状态：看哪一段、在哪个分页、漏斗选了什么、汇总表怎么排、趋势图画哪条线。
 * 五个都只影响显示，不触发重新打库——数据只有一个查询（见 useBillOverviewData）。
 *
 * **三个分页各用一个 FlatList，顶上两行和底下那排分页留在列表外面固定住**：
 * 「总」那一档的明细可能是几百上千行，ScrollView 会把它们全渲染出来，进页面就卡住。
 * 控件固定则是为了翻到第三百行时还能换时间段，不用先滚回顶上。
 */
export default function BillOverviewScreen() {
  const theme = useTheme();

  const [period, setPeriod] = useState<BillPeriod>(() => billPeriodForScope('month', new Date()));
  const [tab, setTab] = useState<BillTab>('overview');
  const [typeFilter, setTypeFilter] = useState<BillTypeFilter>('all');
  const [sortAscending, setSortAscending] = useState(false);
  const [trendMetric, setTrendMetric] = useState<BillTrendMetric>('expense');
  const [isFilterOpen, setFilterOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const data = useBillOverviewData(period, typeFilter, sortAscending);
  const typeLabel = data.categoryType === 'INCOME' ? '收入' : '支出';

  return (
    // 底部安全区由这一层补：底下那排分页要贴着屏幕，但不能被导航栏盖住。
    // 顶上也要——导航栏关掉了，自己画的那两行得自己躲开状态栏
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom', 'left', 'right']}>
      <BillHeader
        scope={period.scope}
        // 换粒度一律回到当下那一段（见 billPeriodForScope 里的说明）
        onScopeChange={(scope: BillScope) => setPeriod(billPeriodForScope(scope, new Date()))}
        onBack={() => router.back()}
        sortAscending={sortAscending}
        onToggleSort={() => setSortAscending(!sortAscending)}
        periodLabel={data.periodLabel}
        canStep={data.canStep}
        onStep={(delta) => setPeriod(shiftBillPeriod(period, delta))}
        isFiltered={typeFilter !== 'all'}
        onOpenFilter={() => setFilterOpen(true)}
      />

      {tab === 'overview' ? (
        <FlatList
          data={data.dayGroups}
          keyExtractor={(group) => group.key}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.header}>
              <BillSummaryCard
                expense={data.expense}
                income={data.income}
                balance={data.balance}
                count={data.count}
                dailyExpense={data.dailyExpense}
                perEntryExpense={data.perEntryExpense}
                pendingReimbursement={data.pendingReimbursement}
                settledReimbursement={data.settledReimbursement}
              />

              {/* 一个点都没有（一笔账都还没记）时整张图不画：一张空图比没有图更难懂 */}
              {data.trend.length > 0 ? (
                <BillTrendChart points={data.trend} metric={trendMetric} onMetricChange={setTrendMetric} />
              ) : null}

              {/* 只有「总计」一行时不画：那张表会跟上面的总览卡一字不差地说同一件事 */}
              {data.rows.length > 1 ? <BillSummaryTable title={data.tableTitle} rows={data.rows} /> : null}

              {data.dayGroups.length > 0 ? (
                <ThemedText type="small" themeColor="textSecondary" style={styles.sectionTitle}>
                  明细{typeFilter === 'all' ? '' : ` · ${typeLabel}`}
                </ThemedText>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <ThemedView type="backgroundElement" style={styles.emptyCard}>
              <ThemedText type="small" themeColor="textSecondary">
                这一段时间还没有账单。换个时间段看看，或者点首页底部的 + 记一笔。
              </ThemedText>
            </ThemedView>
          }
          renderItem={({ item }) => (
            <View style={styles.groupWrap}>
              <TransactionDayCard group={item} onSelect={setDetailId} />
            </View>
          )}
        />
      ) : (
        <FlatList
          // 分类和标签各自是一整张卡（分类那张还要能整体展开收起），所以列表里只有一项。
          // 仍然用 FlatList 而不是 ScrollView：三个分页的滚动容器保持同一种，
          // 切来切去时内边距和回弹手感是一样的
          data={[tab]}
          keyExtractor={(key) => key}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            // 漏斗选「全部」时这两块按支出算，所以这一行必须写明看的是哪一边——
            // 不写的话「分类」这两个字底下到底是支出还是收入，只能靠数字大小去猜
            <ThemedText type="small" themeColor="textSecondary" style={styles.sectionTitle}>
              {typeLabel}构成
            </ThemedText>
          }
          renderItem={() =>
            tab === 'category' ? (
              <View style={styles.categoryTab}>
                {/* 圈只在有账的时候画。一笔都没有时画一个空圈，比不画更像"坏了"——
                    那种情况下 CategoryStatList 自己那句空态已经把话说清楚了 */}
                {data.categories.length > 0 ? (
                  <CategoryDonut categories={data.categories} typeLabel={typeLabel} />
                ) : null}
                {/* 列表紧跟在圈下面，它同时是圈的图例（色点对应环上那一段），
                    所以这两块永远一起出现，不能只留一个 */}
                <CategoryStatList categories={data.categories} />
              </View>
            ) : (
              <BillTagList tags={data.tags} />
            )
          }
        />
      )}

      <BillTabBar value={tab} onChange={setTab} />

      {isFilterOpen ? (
        <BillFilterSheet
          // 选完要**同时**把弹层收掉。`sheet.close(run)` 只负责播出场动画然后跑 run，
          // 它不会替你把组件卸载——弹层挂没挂着是这一层的 state 说了算
          // （全 App 的选择型弹层都是这个约定，见 modal-sheet 里 close 的说明）
          value={typeFilter}
          onSelect={(value) => {
            setTypeFilter(value);
            setFilterOpen(false);
          }}
          onDismiss={() => setFilterOpen(false)}
        />
      ) : null}

      {/* 全 App 同一个详情层。在这里删一笔，invalidateAll 会把这一页的查询一起失效 */}
      {detailId ? <TransactionDetailSheet transactionId={detailId} onDismiss={() => setDetailId(null)} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: ScreenPadding,
    paddingTop: 2,
    // 滚到底时最后一张卡跟底下那排分页之间要有一段空白，不然看起来像被卡住了
    paddingBottom: Spacing.four,
  },
  header: {
    gap: 10,
    marginBottom: 10,
  },
  sectionTitle: {
    letterSpacing: 0.3,
    marginTop: 6,
    marginBottom: 6,
  },
  groupWrap: {
    marginBottom: 10,
  },
  categoryTab: {
    gap: 10,
  },
  emptyCard: {
    borderRadius: 16,
    padding: 16,
  },
});
