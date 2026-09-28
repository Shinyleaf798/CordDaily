import type { ImageSourcePropType } from 'react-native';

/**
 * 分类图标的三种写法，全部存在 `categories.icon` 这一个 TEXT 字段里：
 *
 * | 写法 | 例子 | 图从哪来 |
 * |---|---|---|
 * | emoji | `🍜` | 字体，不需要资源文件 |
 * | 内置图片 | `builtin:food` | 跟 App 一起打包的 `assets/categories/food.png` |
 * | 用户图片 | `file:///.../abc.png` | App 沙盒目录，运行时写进去的 |
 *
 * 为什么不给 icon 拆成 `iconType` + `iconValue` 两列：这个字段的消费方只有"渲染一个图标"
 * 这一个场景，没有任何查询要按类型过滤。拆成两列换来的是每张表、每个 INSERT、每个同步
 * payload 都多一个字段，而收益是零。带前缀的单字段在这里是够用的最小设计。
 *
 * 为什么内置图片要用 `builtin:key` 这层间接引用，而不是直接存文件名：
 * 存的是**引用**不是图片本身，所以换图、改文件名、甚至把 PNG 换成 SVG，都不用动数据库里的任何一行。
 */

export type CategoryIconSource =
  | { kind: 'emoji'; emoji: string }
  | { kind: 'builtin'; key: string; image: ImageSourcePropType | null; fallbackEmoji: string }
  | { kind: 'file'; uri: string };

const BUILTIN_PREFIX = 'builtin:';

/** icon 字段为空、或者引用了一个已经不存在的 key 时显示它 */
export const FALLBACK_EMOJI = '📦';

export type BuiltinCategoryIcon = {
  /** 存进 icon 字段时写成 `builtin:${key}`；也是 assets/categories/ 里的文件名 */
  key: string;
  label: string;
  /** 图片还没放进 assets/categories/ 之前显示这个，保证任何时候都有东西可看 */
  fallbackEmoji: string;
};

// 内置图标库。选图标的界面按这个顺序排，默认分类也从这里取 key。
// 加一个新 key 只改这里 + 下面的 BUILTIN_ICON_IMAGES，不用动数据库。
//
// 前半段跟 DEFAULT_CATEGORIES 那棵树一一对应（父在前、它的子紧随其后），
// 后半段是**树上用不到、但留给用户自建分类挑**的——内置树覆盖不了每个人的消费习惯，
// 用户建「宠物」「医疗」时总得有图可选，删掉它们只会逼人退回纯 emoji。
export const BUILTIN_CATEGORY_ICONS: BuiltinCategoryIcon[] = [
  { key: 'food', label: '餐饮', fallbackEmoji: '🍜' },
  { key: 'breakfast', label: '早餐', fallbackEmoji: '🍳' },
  { key: 'lunch', label: '午餐', fallbackEmoji: '🍱' },
  { key: 'dinner', label: '晚餐', fallbackEmoji: '🍽️' },
  { key: 'takeout', label: '外卖', fallbackEmoji: '🛵' },
  { key: 'drink', label: '饮料', fallbackEmoji: '🥤' },
  { key: 'dessert', label: '甜品', fallbackEmoji: '🍰' },
  { key: 'snack', label: '零食', fallbackEmoji: '🍪' },
  { key: 'transport', label: '交通', fallbackEmoji: '🚌' },
  { key: 'taxi', label: '打车', fallbackEmoji: '🚕' },
  { key: 'bus', label: '公交', fallbackEmoji: '🚏' },
  { key: 'fuel', label: '加油', fallbackEmoji: '⛽' },
  { key: 'parking', label: '停车', fallbackEmoji: '🅿️' },
  { key: 'shopping', label: '购物', fallbackEmoji: '🛍️' },
  { key: 'clothes', label: '服饰', fallbackEmoji: '👕' },
  { key: 'daily-goods', label: '日用品', fallbackEmoji: '🧴' },
  { key: 'online', label: '线上购物', fallbackEmoji: '🛒' },
  { key: 'beauty', label: '美妆', fallbackEmoji: '💄' },
  { key: 'daily', label: '日常', fallbackEmoji: '🏠' },
  { key: 'phone', label: '话费', fallbackEmoji: '📱' },
  { key: 'tech', label: '科技', fallbackEmoji: '💻' },
  { key: 'study', label: '学习', fallbackEmoji: '📚' },
  { key: 'entertainment', label: '娱乐', fallbackEmoji: '🎡' },
  { key: 'movie', label: '电影', fallbackEmoji: '🎬' },
  { key: 'travel', label: '旅行', fallbackEmoji: '✈️' },
  { key: 'game', label: '游戏', fallbackEmoji: '🎮' },
  { key: 'love', label: '恋爱', fallbackEmoji: '💕' },
  { key: 'family', label: '父母', fallbackEmoji: '👨‍👩‍👦' },
  { key: 'savings', label: '储蓄', fallbackEmoji: '🐷' },
  { key: 'epf', label: '公积金', fallbackEmoji: '🏦' },
  { key: 'other', label: '其他', fallbackEmoji: '📦' },
  { key: 'salary', label: '工资', fallbackEmoji: '💰' },
  { key: 'bonus', label: '奖金', fallbackEmoji: '🧧' },
  { key: 'parttime', label: '兼职', fallbackEmoji: '💼' },
  { key: 'invest', label: '投资收益', fallbackEmoji: '📈' },
  { key: 'other-income', label: '其他收入', fallbackEmoji: '💵' },

  // 以下不在默认树上，只在「给自建分类挑图标」时出现
  { key: 'fruit', label: '水果', fallbackEmoji: '🍎' },
  { key: 'renovation', label: '装修', fallbackEmoji: '🔨' },
  { key: 'medical', label: '医疗', fallbackEmoji: '💊' },
  { key: 'social', label: '社交', fallbackEmoji: '🤝' },
  { key: 'pet', label: '宠物', fallbackEmoji: '🐾' },
  { key: 'gift', label: '人情', fallbackEmoji: '🎁' },
  { key: 'bill', label: '账单', fallbackEmoji: '🧾' },
  { key: 'refund', label: '退款', fallbackEmoji: '💵' },
  // 平台 / 品牌图标。默认树里不会出现（换个人就是另一组平台，见 default-categories.ts 的说明），
  // 放进来是为了让自建的「淘宝」也能挑到图，而不是只能配个 🛒
  { key: 'taobao', label: '淘宝', fallbackEmoji: '🛒' },
  { key: 'pinduoduo', label: '拼多多', fallbackEmoji: '🛒' },
  { key: 'shopee', label: 'Shopee', fallbackEmoji: '🛒' },
  { key: 'lazada', label: 'Lazada', fallbackEmoji: '🛒' },
];

/**
 * key → 图片资源的登记表。没登记的 key 走 fallbackEmoji，所以这张表可以一张一张往里加。
 *
 * 必须一个个手写 require，不能 `require('../../assets/categories/' + key + '.png')`：
 * Metro 在打包时静态扫描 require 的字面量来决定哪些资源要打进包，拼出来的路径它看不见，
 * 运行时必然报错。放图的步骤见 assets/categories/README.md。
 *
 * 左边的 key 才是数据库认的那个词，右边的文件名只是给人看的——两边取同名纯粹为了好找。
 */
export const BUILTIN_ICON_IMAGES: Record<string, ImageSourcePropType> = {
  food: require('../../assets/categories/food.png'),
  shopping: require('../../assets/categories/shopping.png'),
  online: require('../../assets/categories/mobile-shopping.png'),
  breakfast: require('../../assets/categories/breakfast.png'),
  lunch: require('../../assets/categories/lunch.png'),
  dinner: require('../../assets/categories/dinner.png'),
  drink: require('../../assets/categories/drink.png'),
  dessert: require('../../assets/categories/dessert.png'),
  snack: require('../../assets/categories/snack.png'),
  // 左边的 key 才是数据库认的那个词；文件名叫什么随意，这里是唯一把两者绑起来的地方
  phone: require('../../assets/categories/phone-bill.png'),
  game: require('../../assets/categories/game.png'),
  family: require('../../assets/categories/family.png'),
  salary: require('../../assets/categories/salary.png'),
  bonus: require('../../assets/categories/bonus.png'),
  savings: require('../../assets/categories/piggy-bank.png'),
  epf: require('../../assets/categories/provident-fund.png'),
  invest: require('../../assets/categories/revenues.png'),
  taobao: require('../../assets/categories/taobao.png'),
  pinduoduo: require('../../assets/categories/pinduoduo.png'),
  shopee: require('../../assets/categories/shopee.png'),
  lazada: require('../../assets/categories/lazada.jpg'),
};

const BUILTIN_BY_KEY = new Map(BUILTIN_CATEGORY_ICONS.map((icon) => [icon.key, icon]));

/** 把 `builtin:food` 这类引用拼出来，避免各处手写字符串前缀 */
export function builtinIconRef(key: string): string {
  return `${BUILTIN_PREFIX}${key}`;
}

/**
 * 把库里那个字符串解析成"该怎么渲染"。
 * 解析不出来一律退回 emoji，绝不抛错——一个图标显示成 📦 是小事，
 * 因为脏数据让整个分类网格崩掉才是大事。
 */
export function parseCategoryIcon(raw: string | null | undefined): CategoryIconSource {
  const icon = raw?.trim();
  if (!icon) return { kind: 'emoji', emoji: FALLBACK_EMOJI };

  if (icon.startsWith(BUILTIN_PREFIX)) {
    const key = icon.slice(BUILTIN_PREFIX.length);
    const entry = BUILTIN_BY_KEY.get(key);
    return {
      kind: 'builtin',
      key,
      image: BUILTIN_ICON_IMAGES[key] ?? null,
      fallbackEmoji: entry?.fallbackEmoji ?? FALLBACK_EMOJI,
    };
  }

  // file:// 和 content://（Android 相册）都当本地文件处理，expo-image 两种都能直接加载
  if (icon.startsWith('file://') || icon.startsWith('content://')) {
    return { kind: 'file', uri: icon };
  }

  return { kind: 'emoji', emoji: icon };
}

// 自定义分类可选的表情。内置图库覆盖不到的场景（"健身""咖啡"这种个人化的分类）靠它兜住，
// 不用为每个人的习惯都画一张图
export const EMOJI_CATEGORY_ICONS: string[] = [
  '🍜', '🍔', '☕', '🍺', '🛒', '👕', '👟', '💄',
  '🚌', '🚗', '⛽', '🚕', '🏠', '💡', '📱', '💻',
  '🎮', '🎬', '🎵', '🏋️', '⚽', '📚', '✏️', '🎓',
  '💊', '🏥', '🦷', '🐾', '🎁', '🧧', '💰', '💼',
  '📈', '🏦', '🧾', '✈️', '🏝️', '🎂', '🤝', '📦',
];
