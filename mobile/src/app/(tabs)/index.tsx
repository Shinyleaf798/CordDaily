import { SafeAreaView } from 'react-native-safe-area-context';

import { PaceLayout } from '@/components/home/layouts/pace-layout';
import { RingLayout } from '@/components/home/layouts/ring-layout';
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      {layoutName === 'ring' ? <RingLayout data={data} /> : <PaceLayout data={data} />}
    </SafeAreaView>
  );
}
