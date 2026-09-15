// 金额显示统一走这里：千分位 + 固定两位小数。
// 之前各处直接 toFixed(2)，RM1842.50 这种四位以上的数字在账本里很难一眼读出量级。
//
// 没用 Intl.NumberFormat：RN 各平台对 Intl 的支持取决于 Hermes 版本和构建时是否带上 ICU，
// 同一份代码在 iOS / Android / web 上可能给出不同结果。账本里数字对不齐是很显眼的问题，
// 所以宁可手写，保证三端完全一致。

/** 1842.5 → "1,842.50"；负数带负号 */
export function formatAmount(value: number): string {
  const [integerPart, decimalPart] = Math.abs(value).toFixed(2).split('.');
  // \B(?=(\d{3})+(?!\d)) ：匹配"后面剩余位数是 3 的整数倍"的非词首位置，即每个千分位分隔点
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${value < 0 ? '-' : ''}${grouped}.${decimalPart}`;
}

/** 1842.5 → "RM1,842.50"；负数是 "-RM1,842.50"，负号在货币符号外面 */
export function formatCurrency(value: number): string {
  return `${value < 0 ? '-' : ''}RM${formatAmount(Math.abs(value))}`;
}

/** 账单行里的金额：按收支方向加正负号，不带货币符号（行内空间紧张，RM 由卡片标题交代） */
export function formatSignedAmount(value: number, type: 'INCOME' | 'EXPENSE'): string {
  return `${type === 'INCOME' ? '+' : '-'}${formatAmount(Math.abs(value))}`;
}
