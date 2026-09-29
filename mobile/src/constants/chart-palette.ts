/**
 * 图表用的**分类色板**。
 *
 * 这是全 App 第一处需要"一组彼此能分开的颜色"的地方——环形图。在这之前每张图都是单色的
 * （构成图的条、趋势图的线），身份由图标和名字承担，所以主题里那三个 `cardHighlight`
 * 就够用了。环形图不行：一个圈上六段颜色如果一样，那个圈什么都没说。
 *
 * ## 这组色是**算出来的，不是挑出来的**
 *
 * 六项检查（明度带 / 彩度下限 / 色觉障碍相邻对区分度 / 正常视觉下限 / 对比度 / 数量上限）
 * 全部由校验脚本跑过，不是肉眼看着顺眼就定下来：
 *
 * - 深色（铺在 `#1c1c1c` 的卡片上）：最差相邻对 ΔE 8.4（protan），正常视觉 19.3，五档全部 ≥ 3:1
 * - 浅色（铺在 `#ffffff` 的卡片上）：最差相邻对 ΔE 9.1（protan），正常视觉 19.6
 *
 * 浅色那组里 aqua / yellow / magenta 三档**对比度低于 3:1**，这在规则里是一条
 * "必须补救"而不是"可以忽略"的警告。补救方式是下面那张列表：每一行都带色块 + 分类名 + 金额，
 * 颜色不是唯一的识别手段。所以环形图**永远不单独出现**，下面那张列表是它的图例。
 *
 * ## 深浅两套是各自选的，不是把同一组颜色调暗
 *
 * 同一批色相、各自在自己那条底色上重新取的步进。直接把浅色那组调暗会同时破坏明度带和对比度。
 *
 * ## 最多五档 + 一个「其他」
 *
 * 环形图的规则是"只用来一眼看个大概，段数 ≤ 6"。再多，相邻两段的颜色就开始糊在一起，
 * 而那时候该看的是下面那张按金额排好的列表，不是圈。
 */

/** 浅色主题（whiteColorful）用，铺在 `#ffffff` 的卡片上 */
const CATEGORICAL_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'];

/** 深色主题（blackGold / blackPurple）用，铺在 `#1c1c1c` 的卡片上 */
const CATEGORICAL_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'];

/**
 * 「其他」那一段的颜色。故意是个**低彩度的灰**，不是色板里的第六档：
 * 它不是一个分类，是"剩下那些加起来"——给它一个跟别人一样鲜艳的颜色，
 * 会让人以为那也是一个具体的类目。
 */
const OTHER_LIGHT = '#9b9ea6';
const OTHER_DARK = '#5a5a5a';

/** 环上最多画几段真分类，超出的并进「其他」 */
export const MAX_CHART_SLOTS = CATEGORICAL_LIGHT.length;

export type ChartPalette = {
  /** 五档分类色，顺序固定 */
  slots: string[];
  other: string;
};

export function chartPalette(isDark: boolean): ChartPalette {
  return isDark
    ? { slots: CATEGORICAL_DARK, other: OTHER_DARK }
    : { slots: CATEGORICAL_LIGHT, other: OTHER_LIGHT };
}

/**
 * 第 index 名该用哪个颜色。超出五档一律是「其他」那个灰。
 *
 * **按名次上色，不是按分类身份上色**——这是有意的，也是这里唯一一处偏离
 * "颜色跟着实体走"那条常规的地方。理由是这个圈上的颜色**不是一个跨视图的身份**：
 * 它只负责把圈上的一段和底下那一行连起来，两者永远同屏出现。
 * 换个月份重新上色不会造成误认，因为没有人是靠"餐饮是蓝色"来认餐饮的——
 * 认它的是图标和名字（同 CategoryBreakdown 里那段说明）。
 *
 * 真要按身份上色也做不了：分类有三十多个，色板只有五档，
 * 按 id 散列会让相邻两段撞色，那才是真的读不了。
 */
export function chartColorAt(palette: ChartPalette, index: number): string {
  return index < palette.slots.length ? palette.slots[index] : palette.other;
}
