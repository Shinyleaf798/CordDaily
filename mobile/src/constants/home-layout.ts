/**
 * 首页的可切换布局。跟色板主题（constants/theme.ts）是两个正交的维度：
 * 这里决定"首页长什么结构"，theme 决定"用哪套颜色"，任意布局 × 任意主题都能组合。
 * 所以每套布局都只准用 theme token，不准写死颜色。
 *
 * 设计阶段一共出了四套方向（见设计画布），这里只实现了选中的两套；
 * 另外两套（数据宫格 / 极简账本）留在设计稿里备查，没有进代码。
 *
 * ## 上下两半分开选
 *
 * 首页是两段拼起来的：**上半**回答"这个月花得怎么样"，**下半**回答"最近花在哪了"。
 * 两段各自有「节奏条」和「金环」两种画法，而这两段之间没有依赖——
 * 上半的横条不需要知道下半是卡片还是细线。既然不依赖，就没有理由捆在一起选：
 * 想要金环的表盘 + 一天一张卡的账单，本来就是一个合理的口味。
 *
 * 所以布局名（`HomeLayoutName`）现在描述的是**一种画法**，不是一整页；
 * 一页由两个槽位（`HomeSlot`）各挑一种画法组成，四种组合都成立。
 */

export type HomeLayoutName = 'pace' | 'ring';

export const HomeLayoutNames: HomeLayoutName[] = ['pace', 'ring'];

export const HomeLayoutLabels: Record<HomeLayoutName, string> = {
  pace: '节奏条',
  ring: '金环',
};

/** 首页的两段。上半是预算和消费，下半是账单列表 */
export type HomeSlot = 'top' | 'bills';

export const HomeSlots: HomeSlot[] = ['top', 'bills'];

export const HomeSlotLabels: Record<HomeSlot, string> = {
  top: '上半 · 预算和消费',
  bills: '下半 · 近7天账单',
};

// 同一个布局名在两段里做的是两件不同的事，所以提示语按段分开写——
// 「金环」在上半是个表盘，在下半是"没有卡片的通栏列表"，共用一句话会两边都说不清
//
// 写得短，因为它们现在挂在首页「编辑」弹层里半屏宽的图卡上（缩略图占掉左边一截），超过两行就挤成一团。
// 原来那一整页「首页设置」里是一整句（「月度总览卡 + 预算横条，进度和时间放同一根轴上比」），那页删了
export const HomeSlotHints: Record<HomeSlot, Record<HomeLayoutName, string>> = {
  top: {
    pace: '总览卡 + 预算横条',
    ring: '还能花多少放环心',
  },
  bills: {
    pace: '一天一张卡',
    ring: '通栏细线',
  },
};

/**
 * 首页「编辑」弹层第一层的两个整页预设：经典 = 上下两段都用节奏条，金环 = 上下两段都用金环。
 *
 * 跟上面两段各自的选择不冲突：预设只是"一次把两段都设成同一种"的快捷方式，
 * 下面「各部分显示什么」仍然能把两段拆开选。两段不一样时第一层哪个都不亮——
 * 那时候它确实不是这两种里的任何一种。
 */
export const HomePresetLabels: Record<HomeLayoutName, string> = {
  pace: '经典',
  ring: '金环',
};

export const HomePresetHints: Record<HomeLayoutName, string> = {
  pace: '卡片 + 预算条',
  ring: '环形预算 + 通栏',
};
