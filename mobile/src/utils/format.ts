// 金额显示统一走这里：千分位 + 固定两位小数。
// 之前各处直接 toFixed(2)，RM1842.50 这种四位以上的数字在账本里很难一眼读出量级。
//
// 没用 Intl.NumberFormat：RN 各平台对 Intl 的支持取决于 Hermes 版本和构建时是否带上 ICU，
// 同一份代码在 iOS / Android / web 上可能给出不同结果。账本里数字对不齐是很显眼的问题，
// 所以宁可手写，保证三端完全一致。

/**
 * 六位数（十万）起缩写成 k，最多两位小数，末尾的 0 不写：
 * 600000 → "600k"，597888 → "597.88k"，1234567 → "1234.56k"。够不着十万返回 null。
 *
 * 用四舍五入后的整数值判断够不够六位：99999.6 照常规写法会显示成 "100,000.00"，
 * 那正是这条规则想避开的六位数，所以它该走 k 这一支。
 *
 * 小数是**截断**不是四舍五入（597.888 → 597.88，不是 597.89）：
 * 缩写本来就是丢精度，丢的方向宁可让显示的钱比实际少几分，也不要凭空多出来。
 */
function toCompactK(abs: number): string | null {
  if (Math.round(abs) < 100000) return null;
  // 先 /10 取整再 /100，等于对"千为单位"的值截断到两位小数
  return `${Math.floor(abs / 10) / 100}k`;
}

/**
 * 1842.5 → "1,842.50"；597888 → "597.88k"；负数带负号。
 *
 * 全 App 的金额都从这里出去（formatCurrency / formatSignedAmount 都调它），
 * 所以"多大的数开始缩写"只有这一处定义——首页的本月支出、日历的当天小计、
 * 每一行账单，六位数以上一律是同一个写法。
 */
export function formatAmount(value: number): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);

  const compact = toCompactK(abs);
  if (compact) return `${sign}${compact}`;

  const [integerPart, decimalPart] = abs.toFixed(2).split('.');
  // \B(?=(\d{3})+(?!\d)) ：匹配"后面剩余位数是 3 的整数倍"的非词首位置，即每个千分位分隔点
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${grouped}.${decimalPart}`;
}

/** 1842.5 → "RM1,842.50"；负数是 "-RM1,842.50"，负号在货币符号外面 */
export function formatCurrency(value: number): string {
  return `${value < 0 ? '-' : ''}RM${formatAmount(Math.abs(value))}`;
}

/**
 * 账单行里的金额：+RM5,000.00 / -RM12.50。
 *
 * 正负号在货币符号外面，跟 formatCurrency 的负号位置一致——全 App 只有一种写法。
 * 早先这里不带 RM（理由是"行内空间紧张，RM 由卡片标题交代"），后来改回带上：
 * 收入不再染绿之后，一行里能说明"这是钱、是进是出"的只剩这个前缀了，
 * 而且卡片标题那边也不是每处都有 RM（日历的当天明细就没有），指望它交代并不成立。
 */
export function formatSignedAmount(value: number, type: 'INCOME' | 'EXPENSE'): string {
  return `${type === 'INCOME' ? '+' : '-'}${formatCurrency(Math.abs(value))}`;
}

/**
 * 日历格子里的金额：1842.5 → "1843"，597888 → "597.88k"。只给量级，不带符号。
 *
 * 跟 formatAmount 的区别只有一条：够不着缩写的时候连分位一起抹掉（1842.5 → "1843"）。
 * 一个格子宽不过四十来点，"1,842.50" 塞进去只能缩到看不清的字号；
 * 格子上的数字是用来**互相比大小**的（哪天花得多），要对账点进去看明细就行。
 * 缩写门槛跟别处共用 toCompactK，不另起一套。
 *
 * 不足 1 块的显示 "<1" 而不是四舍五入成 "0"——记了账却显示 0，看起来像坏了。
 */
export function formatCompactAmount(value: number): string {
  const abs = Math.abs(value);

  const compact = toCompactK(abs);
  if (compact) return compact;

  if (abs > 0 && abs < 1) return '<1';
  return String(Math.round(abs));
}
