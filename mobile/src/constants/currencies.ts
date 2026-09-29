/**
 * 币种。
 *
 * 分两层：**目录**（这个 App 认识哪些币种）和**启用清单**（用户实际会用到哪几种，
 * 存在 app_settings 里，见 db/settings.ts 的 getEnabledCurrencyCodes）。
 *
 * 为什么不把目录也做成用户可编辑的：一个币种不只是一个代码，还有中文名、符号、
 * 小数位和旗子——让用户自己填这四样，换来的是一堆填错的行。目录管"世界上有什么钱"，
 * 启用清单管"我用哪几种"，后者才是每个人不一样的那部分。
 *
 * `decimals` 不是装饰：日元和韩元没有「分」这一级，500 日元写成 "500" 而不是 "500.00"。
 * 金额键盘也读这个数——选了 JPY 之后小数点键就不该让人按下去。
 */
export type Currency = {
  code: string;
  /** 中文名，选币种列表的主行 */
  name: string;
  /** 金额前缀。RM12.50 / J¥500 —— 跟 utils/format 里的写法共用 */
  symbol: string;
  flag: string;
  /** 小数位。日元/韩元是 0，其余是 2 */
  decimals: 0 | 2;
};

/**
 * 记账本身的本位币。所有统计、预算、账户余额都以它为准
 * （对应 Prisma 里 `User.baseCurrency` 的默认值，和 `Transaction.amountInBase` 的 "base"）。
 *
 * 它是**常量不是设置项**：改本位币意味着历史每一笔的 amountInBase 都要按当时汇率重算，
 * 而"当时汇率"这件事只有记账那一刻知道。真要改，是一次数据迁移，不是一个开关。
 */
export const BASE_CURRENCY = 'MYR';

/**
 * 这个 App 认识的全部币种。加一种就往这里加一行——用户在「货币汇率」页里
 * 能挑的就是这张表（减去已经启用的那几个）。
 *
 * 顺序就是添加页面里的顺序：亚洲常去的几个在前面，欧美在后面。
 */
export const CURRENCY_CATALOG: Currency[] = [
  { code: 'MYR', name: '马来西亚林吉特', symbol: 'RM', flag: '🇲🇾', decimals: 2 },
  { code: 'JPY', name: '日元', symbol: 'J¥', flag: '🇯🇵', decimals: 0 },
  { code: 'KRW', name: '韩元', symbol: '₩', flag: '🇰🇷', decimals: 0 },
  { code: 'CNY', name: '人民币', symbol: '¥', flag: '🇨🇳', decimals: 2 },
  { code: 'SGD', name: '新加坡元', symbol: 'S$', flag: '🇸🇬', decimals: 2 },
  { code: 'THB', name: '泰铢', symbol: '฿', flag: '🇹🇭', decimals: 2 },
  { code: 'IDR', name: '印尼盾', symbol: 'Rp', flag: '🇮🇩', decimals: 0 },
  { code: 'VND', name: '越南盾', symbol: '₫', flag: '🇻🇳', decimals: 0 },
  { code: 'HKD', name: '港币', symbol: 'HK$', flag: '🇭🇰', decimals: 2 },
  { code: 'TWD', name: '新台币', symbol: 'NT$', flag: '🇹🇼', decimals: 2 },
  { code: 'PHP', name: '菲律宾比索', symbol: '₱', flag: '🇵🇭', decimals: 2 },
  { code: 'INR', name: '印度卢比', symbol: '₹', flag: '🇮🇳', decimals: 2 },
  { code: 'USD', name: '美元', symbol: '$', flag: '🇺🇸', decimals: 2 },
  { code: 'EUR', name: '欧元', symbol: '€', flag: '🇪🇺', decimals: 2 },
  { code: 'GBP', name: '英镑', symbol: '£', flag: '🇬🇧', decimals: 2 },
  { code: 'AUD', name: '澳元', symbol: 'A$', flag: '🇦🇺', decimals: 2 },
  { code: 'NZD', name: '新西兰元', symbol: 'NZ$', flag: '🇳🇿', decimals: 2 },
  { code: 'CAD', name: '加元', symbol: 'C$', flag: '🇨🇦', decimals: 2 },
  { code: 'CHF', name: '瑞士法郎', symbol: 'Fr', flag: '🇨🇭', decimals: 2 },
  { code: 'AED', name: '阿联酋迪拉姆', symbol: 'د.إ', flag: '🇦🇪', decimals: 2 },
  { code: 'TRY', name: '土耳其里拉', symbol: '₺', flag: '🇹🇷', decimals: 2 },
];

/** 第一次打开时默认启用这几个。之后由用户自己加减，这个常量只在"从没设置过"时用到 */
export const DEFAULT_CURRENCY_CODES = ['JPY', 'KRW', 'CNY', 'USD'];

const BY_CODE = new Map(CURRENCY_CATALOG.map((c) => [c.code, c]));

/** 目录里除本位币以外的全部。添加币种那一页要从这里减去已启用的 */
export const CATALOG_FOREIGN = CURRENCY_CATALOG.filter((c) => c.code !== BASE_CURRENCY);

/**
 * 查一个币种。**查不到也一定返回一个对象**，不返回 null。
 *
 * 理由是这个函数的调用点全在渲染里（账单行、金额显示）。用户把某个币种从启用清单里
 * 删掉之后，**历史账单里那个 code 还在**——那时候该显示的是 "SGD 25.50"，
 * 而不是让那一行崩掉。删币种不影响任何已经记过的账：每笔账的汇率在记账那一刻就存死了。
 */
export function getCurrency(code: string): Currency {
  return BY_CODE.get(code) ?? { code, name: code, symbol: `${code} `, flag: '🏳️', decimals: 2 };
}
