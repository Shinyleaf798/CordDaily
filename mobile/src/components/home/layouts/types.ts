import type { HomeViewData } from '@/hooks/use-home-view-data';

/**
 * 首页两段各自的契约。算好的数据进来，用户的动作出去。
 *
 * 布局组件自己不取数、不改数据，也不认识路由——「点了某一行之后弹什么」是首页决定的，
 * 布局只负责把"哪一行被点了"报上去。
 *
 * 上下两段的 props 分开写，而不是共用一个大类型：**上半根本收不到
 * `onSelectTransaction`**，它压根没有能点的行。类型写成一个的话，四个组件里有两个
 * 会收到一个永远用不上的回调，"这一段管什么"就从签名上看不出来了。
 *
 * 两段都不再负责外面那层 ScrollView 和屏幕内距——那是首页的事（见 app/(tabs)/index）。
 * 一段只是塞进那个滚动容器里的一块，它管的是自己内部长什么样。
 */

/** 上半：预算和消费 */
export type HomeTopProps = {
  data: HomeViewData;
};

/** 下半：近7天账单 */
export type HomeBillsProps = {
  data: HomeViewData;
  onSelectTransaction: (id: string) => void;
};
