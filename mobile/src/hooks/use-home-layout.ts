import { useHomeLayoutStore } from '@/store/home-layout.store';

// 跟 useTheme() 对称：调用方只关心"当前是哪套布局"，不关心它存在哪、怎么持久化
export function useHomeLayout() {
  return useHomeLayoutStore((s) => s.layoutName);
}
