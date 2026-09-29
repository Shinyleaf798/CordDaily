import { router } from 'expo-router';
import { useMemo, useRef, useState, type ReactElement } from 'react';
import { Animated, FlatList, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BillFilterSheet } from '@/components/bill/bill-filter-sheet';
import { BillHeader } from '@/components/bill/bill-header';
import { BillSummaryCard } from '@/components/bill/bill-summary-card';
import { BillSummaryTable } from '@/components/bill/bill-summary-table';
import { BillTabBar, BILL_TAB_KEYS, type BillTab } from '@/components/bill/bill-tab-bar';
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

  // 横向分页用的三样。宽度取窗口宽（App 锁死竖屏，这一层左右也没有安全区内距，
  // 所以窗口宽就是一页宽）；高度得量，理由见下面 onLayout 那段
  const { width: pageWidth } = useWindowDimensions();
  const [pagerHeight, setPagerHeight] = useState(0);
  const pagerRef = useRef<ScrollView>(null);
  // 惰性初始化：Animated.Value 只建一个（同 BillTabBar / segmented-tabs）
  const [scrollX] = useState(() => new Animated.Value(0));

  // 把"滚了多少像素"换算成"停在第几页"，小数就是正滑到一半。分页栏的指示条吃这个值，
  // 于是它跟着手指走而不是等滑完再跳。点分页栏走的是 scrollTo 动画、同样会产生滚动事件，
  // 所以两种切换方式共用这一条动画源，不会出现"点的时候一种动法、滑的时候另一种"
  const progress = useMemo(
    () => scrollX.interpolate({ inputRange: [0, pageWidth], outputRange: [0, 1] }),
    [scrollX, pageWidth],
  );

  // 点分页栏 = 把页面滚过去。tab 状态也同时改，因为 scrollTo 的动画途中
  // onMomentumScrollEnd 还没到，这中间文字高亮不能停在旧的那一格
  const goToTab = (next: BillTab) => {
    setTab(next);
    pagerRef.current?.scrollTo({ x: BILL_TAB_KEYS.indexOf(next) * pageWidth, animated: true });
  };

  const pageStyle = [styles.page, { width: pageWidth, height: pagerHeight || undefined }];

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

      {/* 三个分页并排铺在一条横向 ScrollView 上，pagingEnabled 让它一页一停。
          原来这里是 `tab === 'overview' ? A : B`，同一时刻只有一页存在，所以滑不动——
          要能滑，三页就必须同时铺在一条轨道上。

          不引 react-native-pager-view：那是个新的原生依赖，要重新构建 dev client，
          而这一页要的只是"三屏并排、一页一停"，ScrollView 自带的分页就是这件事。
          横滑和页内竖滑是两个方向，手势不会打架。

          三页常驻挂载（ScrollView 的孩子本来就全部挂载），所以来回滑各自的滚动位置都还在。
          代价是进页面时三页一起建——总览那页是 FlatList、只渲染看得见的几屏，
          另外两页各自只有一张卡，加起来不比原来多多少。 */}
      <Animated.ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        // 页高量出来，不指望交叉轴拉伸：横向 ScrollView 的内容容器高度是被最高的孩子撑出来的，
        // 而这三页的孩子都是 flex 布局的列表、没有自然高度，靠拉伸很容易得到 0（整页空白）。
        // 量到之前先让它拉伸，量到之后钉死，两种情况下都不会是 0
        onLayout={(event) => setPagerHeight(event.nativeEvent.layout.height)}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
        // 停稳了才改 tab：滑到一半又拽回去的不算换页。
        // 这一下重渲染只是换个高亮，不会重算派生（见 useBillOverviewData 里的 memo）
        onMomentumScrollEnd={(event) => {
          const index = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
          const next = BILL_TAB_KEYS[index];
          if (next && next !== tab) setTab(next);
        }}>
        <View style={pageStyle}>
          <FlatList
            data={data.dayGroups}
            keyExtractor={(group) => group.key}
            contentContainerStyle={styles.listContent}
            // 「总」那一档可能是上千个天分组。FlatList 默认在可视区上下各留 10 屏的已挂载内容，
            // 对这一页来说太阔绰了——一个天分组里还嵌着当天的每一笔。收到上下各 2 屏，
            // 快速甩动时最多看到一瞬空白，换来的是挂载的行数少一个数量级。
            //
            // 不开 removeClippedSubviews：它在 Android 上会把嵌套内容整块裁没，
            // 而这一页的每一项正好是"卡片里再套一列行"那种结构。
            windowSize={5}
            initialNumToRender={8}
            maxToRenderPerBatch={8}
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
        </View>

        {/* 漏斗选「全部」时这两页按支出算，所以标题必须写明看的是哪一边——
            不写的话「分类」这两个字底下到底是支出还是收入，只能靠数字大小去猜 */}
        <View style={pageStyle}>
          <StatPage title={`${typeLabel}构成`}>
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
          </StatPage>
        </View>

        <View style={pageStyle}>
          <StatPage title={`${typeLabel}构成`}>
            <BillTagList tags={data.tags} />
          </StatPage>
        </View>
      </Animated.ScrollView>

      <BillTabBar value={tab} onChange={goToTab} progress={progress} />

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

/** 一页里只有一张卡的那两页，共用这一层壳 */
const SINGLE_ITEM = ['content'];

/**
 * 分类页和标签页的外壳：两页都是"一行小标题 + 一整张卡"。
 *
 * 仍然用 FlatList 而不是 ScrollView，虽然里面只有一项：三个分页的滚动容器保持同一种，
 * 左右滑过去时内边距和回弹手感才是一回事。
 */
function StatPage({ title, children }: { title: string; children: ReactElement }) {
  return (
    <FlatList
      data={SINGLE_ITEM}
      keyExtractor={(key) => key}
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={
        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionTitle}>
          {title}
        </ThemedText>
      }
      renderItem={() => children}
    />
  );
}

const styles = StyleSheet.create({
  // 一页 = 一屏宽。**不能给 flex: 1**：横向容器里 flex 管的是宽度，
  // 它会盖掉这里的 width，三页于是挤在一屏里各占三分之一
  page: {
    overflow: 'hidden',
  },
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
