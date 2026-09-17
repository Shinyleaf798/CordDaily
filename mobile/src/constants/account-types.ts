import type { AccountType } from '@/db/accounts';

// 账户类型的中文名。跟色板、布局清单一样属于"静态配置"，所以放 constants/ 而不是 db/：
// 数据层存的是 'CASH' 这种稳定的枚举值，怎么念给用户听是展示层的事，
// 以后要做多语言也是换这一张表，不用动数据库里的任何一行
export const AccountTypeLabels: Record<AccountType, string> = {
  CASH: '现金',
  BANK: '银行卡',
  EWALLET: '电子钱包',
  CREDIT_CARD: '信用卡',
  OTHER: '其他',
};
