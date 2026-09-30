import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HomeHeaderActions } from '@/components/home/home-header-actions';
import { HomeLayoutEditButton } from '@/components/home/home-layout-edit-button';
import { PaceBills } from '@/components/home/layouts/pace-bills';
import { PaceTop } from '@/components/home/layouts/pace-top';
import { RingBills } from '@/components/home/layouts/ring-bills';
import { RingTop } from '@/components/home/layouts/ring-top';
import { SearchOverlay } from '@/components/search/search-overlay';
import { TransactionDetailSheet } from '@/components/transaction/transaction-detail-sheet';
import { PageHeader } from '@/components/ui/page-header';
import { ScreenGap, ScreenPadding } from '@/constants/theme';
import { useHomeLayout } from '@/hooks/use-home-layout';
import { useHomeViewData } from '@/hooks/use-home-view-data';
import { useTheme } from '@/hooks/use-theme';

/**
 * 首页只做一件事：按用户选的布局**分段**分发。
 *
 * 上半（预算和消费）和下半（账单列表）各自独立选画法，四种组合都成立——
 * 两段之间没有依赖，上半的横条不需要知道下半是卡片还是细线（见 constants/home-layout）。
 *
 * 滚动容器和屏幕内距归这里，不归各段：两段拼在**同一条**滚动轴上，
 * 谁来滚动就只能有一个答案。加一种新画法 = 新建一个段组件 + 这里加一行，不用碰数据。
 */
export default function HomeScreen() {
  const theme = useTheme();
  const layout = useHomeLayout();
  const data = useHomeViewData();

  // 详情弹层只存 id，不存整条交易：删掉/改完之后 React Query 会重查，
  // 存快照的话弹层里显示的还是改之前那份
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 搜索是这一屏上的一层，不是一个页面——所以它的开关是首页的一个 state，
  // 而不是路由栈里的一条记录（理由见 components/home/home-header-actions）
  const [isSearchOpen, setSearchOpen] = useState(false);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'left', 'right']}>
      {/* 标题条钉在这里，在 ScrollView 外面：它不跟着内容滚走，跟底部 tab bar 对称 */}
      <PageHeader title="首页" right={<HomeHeaderActions onOpenSearch={() => setSearchOpen(true)} />} />

      <ScrollView contentContainerStyle={styles.content}>
        {layout.top === 'ring' ? <RingTop data={data} /> : <PaceTop data={data} />}

        {layout.bills === 'ring' ? (
          <RingBills data={data} onSelectTransaction={setSelectedId} />
        ) : (
          <PaceBills data={data} onSelectTransaction={setSelectedId} />
        )}

        {/* 这一块同时就是底部留白，所以 content 里没有 paddingBottom（见 HomeLayoutEditButton） */}
        <HomeLayoutEditButton />
      </ScrollView>

      {/* 两个弹层都由首页持有而不是某一段：换了布局点同一个东西应该弹出同一个东西，
          放进段里就会变成好几份要同步维护的实现 */}
      {selectedId ? (
        <TransactionDetailSheet transactionId={selectedId} onDismiss={() => setSelectedId(null)} />
      ) : null}

      {isSearchOpen ? <SearchOverlay onDismiss={() => setSearchOpen(false)} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    // 屏幕左右留白。比别的页（Spacing.three = 16）窄，是因为首页整页都是卡片：
    // 卡片自己已经有 16~20 的内距，外面再留 16 就等于边上叠了两层空白
    paddingHorizontal: ScreenPadding,
    // 标题条底下那段距离
    paddingTop: ScreenGap,
    // 没有 paddingBottom：底部留白由最后那颗编辑按钮自己占（它的高度就是 ScreenBottomInset）
    gap: ScreenGap,
  },
});
