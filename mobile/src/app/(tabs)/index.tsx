import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PaceLayout } from '@/components/home/layouts/pace-layout';
import { RingLayout } from '@/components/home/layouts/ring-layout';
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      {layoutName === 'ring' ? (
        <RingLayout data={data} onSelectTransaction={setSelectedId} />
      ) : (
        <PaceLayout data={data} onSelectTransaction={setSelectedId} />
      )}

      {/* 弹层由首页持有而不是布局：两套布局点同一行应该弹出同一个东西，
          放进布局里就会变成两份要同步维护的实现 */}
      {selectedId ? (
        <TransactionDetailSheet transactionId={selectedId} onDismiss={() => setSelectedId(null)} />
      ) : null}
    </SafeAreaView>
  );
}
