import * as Crypto from 'expo-crypto';

import { BASE_CURRENCY } from '@/constants/currencies';
import { addDays } from '@/utils/date';

import { getDb } from './client';
import { listCachedRates, toBaseRate } from './exchange-rates';
import { createTransaction, type CreateTransactionInput, type TransactionType } from './transactions';

/**
 * 周期记账（CLAUDE.md 原则#4）：一条规则 = 「多久一次 / 多少钱 / 什么分类 / 哪个账户」，
 * 它生成的每一笔仍然是一条普通交易，只是多带一个 recurringId 指回规则。
 *
 * **生成全在本地、在 App 打开时补**：没有服务器定时任务，也不碰后台任务。
 * 三个月没打开 App，再打开时一次补齐欠下的三笔，日期就是它们各自该发生的那天。
 */

export type RecurringFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export const FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  DAILY: '每天',
  WEEKLY: '每周',
  MONTHLY: '每月',
  YEARLY: '每年',
};

type RecurringRow = {
  id: string;
  title: string;
  remarks: string | null;
  amount: number;
  currency: string;
  exchangeRate: number;
  type: TransactionType;
  frequency: RecurringFrequency;
  startDate: string;
  nextRunDate: string;
  endDate: string | null;
  isActive: number;
  categoryId: string;
  accountId: string;
  createdAt: string;
  deletedAt: string | null;
  synced: number;
};

export type RecurringRule = Omit<RecurringRow, 'isActive'> & {
  isActive: boolean;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryParentName: string | null;
};

/**
 * 从「这一次」推到「下一次」。
 *
 * 月和年**不在上一次的日期上加**，而是从 startDate 那个锚点重新算：
 * 31 号开始的月付，一路加下去是 1/31 → 2/28 → 3/28 → 4/28……2 月那一次之后就永远停在 28 号了。
 * 按锚点算是 1/31 → 2/28 → 3/31 → 4/30，每个月都落在"那个月的最后一天"——跟信用卡扣款的口径一致。
 * 时分也取锚点的，生成出来的账跟用户当初记那一笔时是同一个钟点。
 */
export function nextOccurrence(anchor: Date, frequency: RecurringFrequency, current: Date): Date {
  if (frequency === 'DAILY' || frequency === 'WEEKLY') {
    const next = addDays(current, frequency === 'DAILY' ? 1 : 7);
    next.setHours(anchor.getHours(), anchor.getMinutes(), anchor.getSeconds(), 0);
    return next;
  }

  const stepMonths = frequency === 'MONTHLY' ? 1 : 12;
  const elapsed = (current.getFullYear() - anchor.getFullYear()) * 12 + current.getMonth() - anchor.getMonth();
  const target = new Date(anchor.getFullYear(), anchor.getMonth() + elapsed + stepMonths, 1);
  const daysInMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(anchor.getDate(), daysInMonth));
  target.setHours(anchor.getHours(), anchor.getMinutes(), anchor.getSeconds(), 0);
  return target;
}

/**
 * 「重复」选择器里用户选的东西：频率 + 落在哪一天。
 * weekday 是 getDay() 的口径（0 = 周日），month 是 getMonth() 的口径（0 = 一月），monthDay 是 1–31。
 * 三个都一直带着，只是按频率各用各的——切换频率时用户刚选好的日子不会丢。
 */
export type RepeatSetting = {
  frequency: RecurringFrequency;
  weekday: number;
  monthDay: number;
  month: number;
};

export const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** 默认落在参考日那天（记账页上就是这笔账的日期；编辑页是规则原来的开始日期） */
export function settingFromDate(frequency: RecurringFrequency, date: Date): RepeatSetting {
  return { frequency, weekday: date.getDay(), monthDay: date.getDate(), month: date.getMonth() };
}

/** 每天 / 每周三 / 每月1号 / 每年3月5日 */
export function describeRepeat(setting: RepeatSetting): string {
  switch (setting.frequency) {
    case 'DAILY':
      return '每天';
    case 'WEEKLY':
      return `每${WEEKDAY_NAMES[setting.weekday]}`;
    case 'MONTHLY':
      return `每月${setting.monthDay}号`;
    case 'YEARLY':
      return `每年${setting.month + 1}月${setting.monthDay}日`;
  }
}

/** 列表页、编辑页上那句「每月1号」：规则只存了频率和锚点，日子从锚点上读 */
export function describeRule(rule: { frequency: RecurringFrequency; startDate: string }): string {
  return describeRepeat(settingFromDate(rule.frequency, new Date(rule.startDate)));
}

/**
 * 选好的「每周三 / 每月 31 号」→ 规则的锚点（startDate），时分取参考日的。
 *
 * 锚点是参考日当天或之后第一个对得上的日子——**除了一种情况**：选的日子在那个月不存在
 * （31 号碰上 11 月、2 月 29 号碰上平年）。nextOccurrence 是按锚点的日号往后推的，
 * 锚点要是被压成了 11/30，之后每个月都会停在 30 号。所以这时锚点往回找最近一个
 * 真有这一天的月份（10/31），它可能早于参考日，但只用来定"日号"，真正的下一次由 firstUpcoming 算，
 * 11 月那一次照样落在 11/30。
 */
export function anchorFor(setting: RepeatSetting, reference: Date): Date {
  const at = (y: number, m: number, d: number) =>
    new Date(y, m, d, reference.getHours(), reference.getMinutes(), reference.getSeconds());
  const today = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());

  if (setting.frequency === 'DAILY') return at(reference.getFullYear(), reference.getMonth(), reference.getDate());

  if (setting.frequency === 'WEEKLY') {
    const ahead = (setting.weekday - reference.getDay() + 7) % 7;
    return at(reference.getFullYear(), reference.getMonth(), reference.getDate() + ahead);
  }

  const stepMonths = setting.frequency === 'MONTHLY' ? 1 : 12;
  // 从参考日所在的那一期开始找：月付是这个月，年付是今年里选的那个月
  let year = reference.getFullYear();
  let month = setting.frequency === 'MONTHLY' ? reference.getMonth() : setting.month;
  const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
  if (new Date(year, month, Math.min(setting.monthDay, daysIn(year, month))) < today) month += stepMonths;

  // 往回找一个真有这一天的期（31 号最多退两个月，2 月 29 号最多退四年）
  let back = month;
  while (daysIn(year, back) < setting.monthDay) back -= stepMonths;
  return at(year, back, setting.monthDay);
}

/** 列表页用。软删的不出现；暂停的照常列出来（它还在，只是不生成） */
export async function listRecurringRules(): Promise<RecurringRule[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<
    RecurringRow & { categoryName: string | null; categoryIcon: string | null; categoryParentName: string | null }
  >(
    `SELECT r.*, c.name AS categoryName, c.icon AS categoryIcon, p.name AS categoryParentName
     FROM recurring_transactions r
     LEFT JOIN categories c ON c.id = r.categoryId
     LEFT JOIN categories p ON p.id = c.parentId
     WHERE r.deletedAt IS NULL
     ORDER BY r.isActive DESC, r.nextRunDate`,
  );
  return rows.map((row) => ({ ...row, isActive: row.isActive === 1 }));
}

export type CreateRecurringInput = {
  title: string;
  remarks?: string | null;
  amount: number;
  currency?: string;
  exchangeRate?: number;
  type: TransactionType;
  frequency: RecurringFrequency;
  /** 第一次发生的时刻，也是之后每一次的锚点（见 nextOccurrence） */
  startDate: string;
  categoryId: string;
  accountId: string;
};

/**
 * 建一条规则，**连同记账页上那一笔一起记**（用户填的那一整笔，带上 recurringId）。
 *
 * 第一笔不交给生成器：规则表只有主题/备注/金额/分类/账户这几列（跟服务器的表一致），
 * 店名、地点、标签、报销这些用户刚刚在表单上填的东西进不了规则，让生成器来记的话第一笔就把它们丢了。
 * 以后自动生成的那几笔确实没有这些——那是规则表的边界，但至少眼前这笔跟用户填的一模一样。
 *
 * 记账页那一笔**不一定落在规则的日子上**：今天 22 号补记这个月的订阅费，规则却是"每月 1 号"。
 * 这一笔照常记在它自己的日期，规则的下一次是那个日期**之后**第一个对得上的日子（见 firstUpcoming）。
 * 规则和这一笔在同一个事务里：不会出现规则建好了、这一笔没记上，或者反过来。
 */
export async function createRecurringRule(
  input: CreateRecurringInput,
  first: Omit<CreateTransactionInput, 'recurringId'> & { date: string },
): Promise<void> {
  const db = await getDb();
  const id = Crypto.randomUUID();
  const currency = input.currency ?? BASE_CURRENCY;
  const start = new Date(input.startDate);
  const nextRunDate = firstUpcoming(start, input.frequency, new Date(first.date));

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO recurring_transactions
         (id, title, remarks, amount, currency, exchangeRate, type, frequency, startDate, nextRunDate,
          endDate, isActive, categoryId, accountId, createdAt, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?, ?, 0)`,
      [
        id, input.title, input.remarks?.trim() || null, input.amount, currency,
        currency === BASE_CURRENCY ? 1 : (input.exchangeRate ?? 1),
        input.type, input.frequency, start.toISOString(), nextRunDate.toISOString(),
        input.categoryId, input.accountId, new Date().toISOString(),
      ],
    );
    await createTransaction({ ...first, recurringId: id });
  });
}

/**
 * 暂停 / 继续。
 *
 * **继续时跳过暂停期间欠下的那几次**，把 nextRunDate 挪到"从现在起的下一次"：
 * 暂停的意思就是"这段时间别记"（退订了几个月又续上），恢复的那一刻把它们一口气补出来，
 * 等于暂停从没生效过。
 */
export async function setRecurringActive(id: string, active: boolean): Promise<void> {
  const db = await getDb();
  if (!active) {
    await db.runAsync('UPDATE recurring_transactions SET isActive = 0, synced = 0 WHERE id = ?', [id]);
    return;
  }

  const rule = await db.getFirstAsync<RecurringRow>('SELECT * FROM recurring_transactions WHERE id = ?', [id]);
  if (!rule) return;
  const anchor = new Date(rule.startDate);
  const now = new Date();
  let next = new Date(rule.nextRunDate);
  while (next < now) next = nextOccurrence(anchor, rule.frequency, next);
  await db.runAsync(
    'UPDATE recurring_transactions SET isActive = 1, nextRunDate = ?, synced = 0 WHERE id = ?',
    [next.toISOString(), id],
  );
}

export type UpdateRecurringInput = {
  id: string;
  title: string;
  remarks: string | null;
  amount: number;
  currency: string;
  /** 1 个 currency 换多少本位币。本位币时忽略（恒为 1） */
  exchangeRate: number;
  type: TransactionType;
  frequency: RecurringFrequency;
  startDate: string;
  /** null = 不结束 */
  endDate: string | null;
  categoryId: string;
  accountId: string;
};

/**
 * 「改完之后下一次在哪」：从新的开始日期按新的频率往后数，**跳过所有已经过去的那几次**。
 *
 * 跳过是这次编辑"只影响以后"的另一半：改的那一刻之前的日子，要么已经由旧规则记过了，
 * 要么本来就不该有（把开始日期往前挪，不是让它补记一串当年的账）。
 * 开始日期在将来就直接是开始日期本身。编辑页拿它做"下次 X 月 X 日"的预览，跟存进去的是同一个算法
 */
export function firstUpcoming(startDate: Date, frequency: RecurringFrequency, now: Date = new Date()): Date {
  let next = startDate;
  // 上限只是兜底防死循环：十万步的「每天」也有两百多年，正常的日期永远碰不到它
  for (let i = 0; next <= now && i < 100000; i += 1) next = nextOccurrence(startDate, frequency, next);
  return next;
}

/**
 * 改一条规则，**哪个字段都能改**。只影响以后生成的：已经记上的账是普通交易，
 * 跟规则只剩一个 recurringId 的联系，这里一笔都不去碰——订阅涨价那天之前的几个月确实是按旧价付的。
 *
 * 频率或开始日期变了才重算 nextRunDate（见 firstUpcoming）；只改金额、分类这些时原样保留，
 * 不然一条暂停中的规则改个备注，下次继续时欠的那几次就被悄悄跳掉了——那是 setRecurringActive 的事。
 */
export async function updateRecurringRule(input: UpdateRecurringInput): Promise<void> {
  const db = await getDb();
  const rule = await db.getFirstAsync<RecurringRow>('SELECT * FROM recurring_transactions WHERE id = ?', [input.id]);
  if (!rule) throw new Error('这条周期记账已经不在了');

  const start = new Date(input.startDate);
  const scheduleChanged =
    rule.frequency !== input.frequency || new Date(rule.startDate).getTime() !== start.getTime();
  const nextRunDate = scheduleChanged ? firstUpcoming(start, input.frequency).toISOString() : rule.nextRunDate;

  await db.runAsync(
    `UPDATE recurring_transactions SET
       title = ?, remarks = ?, amount = ?, currency = ?, exchangeRate = ?, type = ?, frequency = ?,
       startDate = ?, nextRunDate = ?, endDate = ?, categoryId = ?, accountId = ?, synced = 0
     WHERE id = ?`,
    [
      input.title.trim(),
      input.remarks?.trim() || null,
      input.amount,
      input.currency,
      input.currency === BASE_CURRENCY ? 1 : input.exchangeRate,
      input.type,
      input.frequency,
      start.toISOString(),
      nextRunDate,
      input.endDate,
      input.categoryId,
      input.accountId,
      input.id,
    ],
  );
}

/**
 * 删规则 = 软删（原因见 db/schema.ts 的 v14）。**它已经生成的账一笔不动**——
 * 那几个月的订阅费是真花出去了，删规则只是"以后别再记"。
 */
export async function deleteRecurringRule(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE recurring_transactions SET deletedAt = ?, isActive = 0, synced = 0 WHERE id = ?',
    [new Date().toISOString(), id],
  );
}

/**
 * 一条规则一口气最多补多少笔。防的是一条「每天」的规则开始日期被设到了好几年前，
 * 一打开 App 就往库里灌上千行。真碰到上限也不会丢：nextRunDate 停在补到的地方，下次打开接着补。
 */
const MAX_PER_RUN = 400;

let running: Promise<number> | null = null;

/**
 * 补生成所有到期的账，返回这次一共记了几笔（调用方据此决定要不要刷新界面）。
 *
 * 同一时刻只跑一份：启动和回到前台、或者刚建完规则那一下，可能几乎同时触发，
 * 两份并发各自读到同一个 nextRunDate，就会把同一个月记两遍。
 */
export function runDueRecurring(): Promise<number> {
  if (!running) {
    running = generateDue().finally(() => {
      running = null;
    });
  }
  return running;
}

async function generateDue(): Promise<number> {
  const db = await getDb();
  const now = new Date();
  // ISO 字符串（全是 toISOString 写的，统一 UTC + Z）按字典序比就是按时间比
  const rules = await db.getAllAsync<RecurringRow>(
    `SELECT * FROM recurring_transactions
     WHERE isActive = 1 AND deletedAt IS NULL AND nextRunDate <= ?`,
    [now.toISOString()],
  );
  if (rules.length === 0) return 0;

  const cached = await listCachedRates();
  let created = 0;

  for (const rule of rules) {
    // 外币规则**用生成这一刻缓存里的汇率**，缓存里没有才退回建规则时冻住的那个。
    // 跟手记的账"汇率存下就不再变"并不矛盾：每个月那笔扣款是按那个月的汇率结算的，
    // 一直沿用建规则那天的汇率才是错的。补生成好几个月时它们共用今天这一个数——
    // 拿不到过去每一天的历史汇率，这是能做到的最接近的
    const perBase = rule.currency === BASE_CURRENCY ? null : cached[rule.currency]?.perBase;
    const exchangeRate = perBase ? toBaseRate(perBase) : rule.exchangeRate;

    const anchor = new Date(rule.startDate);
    const end = rule.endDate ? new Date(rule.endDate) : null;
    let next = new Date(rule.nextRunDate);
    let count = 0;

    // 一条规则的"插账 + 推 nextRunDate"是一个事务：中途崩了要么都在、要么都不在，
    // 不会出现账插进去了、nextRunDate 没动，下次打开又插一遍
    await db.withTransactionAsync(async () => {
      while (next <= now && (!end || next <= end) && count < MAX_PER_RUN) {
        await createTransaction({
          title: rule.title,
          remarks: rule.remarks,
          amount: rule.amount,
          currency: rule.currency,
          exchangeRate,
          type: rule.type,
          categoryId: rule.categoryId,
          accountId: rule.accountId,
          date: next.toISOString(),
          recurringId: rule.id,
        });
        count += 1;
        next = nextOccurrence(anchor, rule.frequency, next);
      }
      await db.runAsync(
        'UPDATE recurring_transactions SET nextRunDate = ?, synced = 0 WHERE id = ?',
        [next.toISOString(), rule.id],
      );
    });
    created += count;
  }

  return created;
}
