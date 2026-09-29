import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PaceLayout } from '@/components/home/layouts/pace-layout';
import { RingLayout } from '@/components/home/layouts/ring-layout';
import { SearchOverlay } from '@/components/search/search-overlay';
import { TransactionDetailSheet } from '@/components/transaction/transaction-detail-sheet';
import { useHomeLayout } from '@/hooks/use-home-layout';
import { useHomeViewData } from '@/hooks/use-home-view-data';
import { useTheme } from '@/hooks/use-theme';

// 首页只做一件事：按用户选的布局分发。
// 取数和派生全在 useHomeViewData 里，布局组件只负责画——
// 加一套新布局 = 新建一个布局组件 + constants/home-layout.ts 和这里各加一行，不用碰数据。
export default function HomeScreen() {
  const theme = useTheme();
  const layoutName = useHomeLayout();
  const data = useHomeViewData();

  // 详情弹层只存 id，不存整条交易：删掉/改完之后 React Query 会重查，
  // 存快照的话弹层里显示的还是改之前那份
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 搜索是这一屏上的一层，不是一个页面——所以它的开关是首页的一个 state，
  // 而不是路由栈里的一条记录（理由见 components/home/home-header-actions）
  const [isSearchOpen, setSearchOpen] = useState(false);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'left', 'right']}>
      {layoutName === 'ring' ? (
        <RingLayout data={data} onSelectTransaction={setSelectedId} onOpenSearch={() => setSearchOpen(true)} />
      ) : (
        <PaceLayout data={data} onSelectTransaction={setSelectedId} onOpenSearch={() => setSearchOpen(true)} />
      )}

      {/* 两个弹层都由首页持有而不是布局：两套布局点同一个东西应该弹出同一个东西，
          放进布局里就会变成两份要同步维护的实现 */}
      {selectedId ? (
        <TransactionDetailSheet transactionId={selectedId} onDismiss={() => setSelectedId(null)} />
      ) : null}

      {isSearchOpen ? <SearchOverlay onDismiss={() => setSearchOpen(false)} /> : null}
    </SafeAreaView>
  );
}
