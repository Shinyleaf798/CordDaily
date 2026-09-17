import type { HomeViewData } from '@/hooks/use-home-view-data';

/**
 * 每套首页布局都收同一组 props，所以类型写在这里共用。
 *
 * 加一套新布局时，这个类型就是那份契约：算好的数据进来，用户的动作出去。
 * 布局组件自己不取数、不改数据，也不认识路由——「点了某一行之后弹什么」是首页决定的，
 * 布局只负责把"哪一行被点了"报上去。
 */
export type HomeLayoutProps = {
  data: HomeViewData;
  onSelectTransaction: (id: string) => void;
};
