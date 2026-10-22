import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HomeEditButton } from '@/components/home/home-edit-button';
import { HomeHeaderActions } from '@/components/home/home-header-actions';
import { HomeStyleOptions } from '@/components/home/home-style-options';
import { HomeStyleSheet, type StyleChoice } from '@/components/home/home-style-sheet';
import { ClassicThumbnail, RingThumbnail } from '@/components/home/home-style-thumbnails';
import { PaceBills } from '@/components/home/layouts/pace-bills';
import { PaceTop } from '@/components/home/layouts/pace-top';
import { RingBills } from '@/components/home/layouts/ring-bills';
import { RingTop } from '@/components/home/layouts/ring-top';
import { SearchOverlay } from '@/components/search/search-overlay';
import { TransactionDetailSheet } from '@/components/transaction/transaction-detail-sheet';
import { PageHeader } from '@/components/ui/page-header';
import { HomeLayoutNames, HomePresetHints, HomePresetLabels, type HomeLayoutName } from '@/constants/home-layout';
import { ScreenGap, ScreenPadding } from '@/constants/theme';
import { useHomeLayout } from '@/hooks/use-home-layout';
import { useHomeViewData } from '@/hooks/use-home-view-data';
import { useTheme } from '@/hooks/use-theme';
import { useHomeStore } from '@/store/home.store';

/** 「编辑」弹层第一层的两个整页预设（见 constants/home-layout 的 HomePresetLabels） */
const PRESET_THUMBNAILS: Record<HomeLayoutName, StyleChoice<HomeLayoutName>['Thumbnail']> = {
  pace: ClassicThumbnail,
  ring: RingThumbnail,
};

const PRESETS: StyleChoice<HomeLayoutName>[] = HomeLayoutNames.map((name) => ({
  key: name,
  label: HomePresetLabels[name],
  hint: HomePresetHints[name],
  Thumbnail: PRESET_THUMBNAILS[name],
}));

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
  // 每次渲染重取：App 挂在后台跨过月底再回来，标题的月份要跟着变
  const now = new Date();
  const layout = useHomeLayout();
  const data = useHomeViewData();

  // 详情弹层只存 id，不存整条交易：删掉/改完之后 React Query 会重查，
  // 存快照的话弹层里显示的还是改之前那份
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 搜索是这一屏上的一层，不是一个页面——所以它的开关是首页的一个 state，
  // 而不是路由栈里的一条记录（理由见 components/home/home-header-actions）
  const [isSearchOpen, setSearchOpen] = useState(false);
  const [isEditingStyle, setEditingStyle] = useState(false);
  const setSlot = useHomeStore((s) => s.setSlot);

  // 两段选成一样才算是某个预设；拆开选的时候第一层哪个都不亮
  const preset = layout.top === layout.bills ? layout.top : null;
  const applyPreset = (name: HomeLayoutName) => {
    setSlot('top', name);
    setSlot('bills', name);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'left', 'right']}>
      {/* 标题条钉在这里，在 ScrollView 外面：它不跟着内容滚走，跟底部 tab bar 对称 */}
      {/* 标题写月份，不写「首页」：底部 tab 已经亮着「首页」，再写一遍是废话；
          而「现在是几月」正是这一页上半那些数字（本月支出、本月预算）的前提。
          这一行不能整行拿掉，右边还挂着搜索和账单预览两个入口 */}
      <PageHeader
        title={`${now.getMonth() + 1}月`}
        note={String(now.getFullYear())}
        right={<HomeHeaderActions onOpenSearch={() => setSearchOpen(true)} />}
      />

      <ScrollView contentContainerStyle={styles.content}>
        {layout.top === 'ring' ? <RingTop data={data} /> : <PaceTop data={data} />}

        {layout.bills === 'ring' ? (
          <RingBills data={data} onSelectTransaction={setSelectedId} />
        ) : (
          <PaceBills data={data} onSelectTransaction={setSelectedId} />
        )}

        {/* 这一块同时就是底部留白，所以 content 里没有 paddingBottom（见 HomeEditButton） */}
        <HomeEditButton onPress={() => setEditingStyle(true)} />
      </ScrollView>

      {/* 两个弹层都由首页持有而不是某一段：换了布局点同一个东西应该弹出同一个东西，
          放进段里就会变成好几份要同步维护的实现 */}
      {selectedId ? (
        <TransactionDetailSheet transactionId={selectedId} onDismiss={() => setSelectedId(null)} />
      ) : null}

      {isSearchOpen ? <SearchOverlay onDismiss={() => setSearchOpen(false)} /> : null}

      {isEditingStyle ? (
        <HomeStyleSheet
          title="首页样式"
          choices={PRESETS}
          selected={preset}
          onSelect={applyPreset}
          options={<HomeStyleOptions />}
          onDismiss={() => setEditingStyle(false)}
        />
      ) : null}
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
