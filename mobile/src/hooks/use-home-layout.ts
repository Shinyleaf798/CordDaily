import { useHomeStore } from '@/store/home.store';

// 跟 useTheme() 对称：调用方只关心"当前是哪种画法"，不关心它存在哪、怎么持久化。
// 两段分开取（而不是返回整个 store）：首页只在这两个值真的变了时才需要重渲染。
// 「看多长一段」不从这里出——那个值只有取数那层要（见 use-home-view-data）
export function useHomeLayout() {
  const top = useHomeStore((s) => s.top);
  const bills = useHomeStore((s) => s.bills);
  return { top, bills };
}
