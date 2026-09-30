import { useHomeLayoutStore } from '@/store/home-layout.store';

// 跟 useTheme() 对称：调用方只关心"当前是哪套布局"，不关心它存在哪、怎么持久化。
// 两段分开取（而不是返回整个 store）：首页只在这两个值真的变了时才需要重渲染
export function useHomeLayout() {
  const top = useHomeLayoutStore((s) => s.top);
  const bills = useHomeLayoutStore((s) => s.bills);
  return { top, bills };
}
