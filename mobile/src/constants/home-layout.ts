/**
 * 首页的可切换布局。跟色板主题（constants/theme.ts）是两个正交的维度：
 * 这里决定"首页长什么结构"，theme 决定"用哪套颜色"，任意布局 × 任意主题都能组合。
 * 所以每套布局都只准用 theme token，不准写死颜色。
 *
 * 设计阶段一共出了四套方向（见设计画布），这里只实现了选中的两套；
 * 另外两套（数据宫格 / 极简账本）留在设计稿里备查，没有进代码。
 */

export type HomeLayoutName = 'pace' | 'ring';

export const HomeLayoutNames: HomeLayoutName[] = ['pace', 'ring'];

export const HomeLayoutLabels: Record<HomeLayoutName, string> = {
  pace: '节奏条',
  ring: '金环',
};

export const HomeLayoutHints: Record<HomeLayoutName, string> = {
  pace: '预算进度和时间进度放同一根轴上比',
  ring: '把「本月还能花多少」做成主角',
};
