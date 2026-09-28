/**
 * 「上次成功推上去的那一行长什么样」——分类和账户的内容指纹。
 *
 * **为什么需要它。** `synced` 是个布尔，记的是"这行被动过"，不是"这行跟云端不一样"。
 * 把「FGO」改名成「FGO1」再改回「FGO」，两次 UPDATE 各把它置一次 0，
 * 于是备份层永远显示"要上传的分类 1 条"——而那一行跟云端一模一样。
 * 推上去无害（服务器是按 `(userId, id)` 的 upsert），但那个数字在说谎，
 * 跟这个项目早先消灭过的"空账本显示要上传 30 条"是同一类毛病。
 *
 * 指纹把判据从**动没动过**换成**跟上次推上去的那份一不一样**：
 * 推送成功时把这个字符串写进 `syncedFingerprint`，之后现算一次跟它比。
 * 改一圈又改回去，算出来的还是同一个串，于是不算待上传。
 *
 * **它比的是"上次推的那份"，不是服务器此刻的状态。** 真去问服务器要联网，
 * 而备份卡和备份弹层现在是纯离线的（只读本地 SQLite），改成联网就得回答
 * "断网时这张卡显示什么"。离线能给出的最好答案就是这个，而它对用户的问题
 * （"我有没有东西还没上去"）是准的——除非有人从另一台设备改了云端，
 * 而那属于双向同步，是 CLAUDE.md 原则#1 明确划出去的另一个子系统。
 *
 * **字段必须跟推送的 payload 逐一对齐**（见 db/sync.ts 里那两条 SELECT）。
 * 多比一个字段，就会把一个根本不会上云的本地变化算成"待上传"；
 * 少比一个，真变化会被漏掉——而后者是静默的：界面显示"云端已是最新"，改动却永远上不去。
 *
 * **存原串不存哈希**：一行分类就几十个字节，哈希省不下什么，却让"为什么这行被判成脏的"
 * 从 diff 两个字符串变成没法排查。`JSON.stringify` 一个定序数组顺带解决了转义——
 * 名字里带引号或分隔符不会把指纹拼串。
 *
 * 只给分类和账户做：它们各几十行，每次统计现算的开销可以忽略，而"改一圈又改回去"
 * （改名、换图标、拖顺序）恰恰只在这两张表上真会发生。账单继续用布尔——
 * 几千行每次都算一遍不值得，改一笔账又原样改回去也不常见。
 */

export type CategoryFingerprintRow = {
  id: string;
  name: string;
  icon: string | null;
  type: string;
  parentId: string | null;
  sortOrder: number;
  isActive: number | boolean;
};

export type AccountFingerprintRow = {
  id: string;
  name: string;
  type: string;
  currency: string;
  openingBalance: number;
  icon: string | null;
};

export function categoryFingerprint(row: CategoryFingerprintRow): string {
  return JSON.stringify([
    row.id,
    row.name,
    row.icon ?? null,
    row.type,
    row.parentId ?? null,
    Number(row.sortOrder ?? 0),
    // 归一成 0/1：库里是 SQLite 的整数，推送前会转成 boolean，恢复的包里也可能是 true/false。
    // 不归一的话同一行在三条路上会算出三个指纹，每次都判成"变了"
    row.isActive ? 1 : 0,
  ]);
}

/**
 * 这一行**自上次同步以来，本地动过没有**。三方合并全靠这个问题的答案：
 * 没动过 → 云端那份是新的，采用它；动过 → 是本地的改动，留着，等推送。
 *
 * 三级判据，按可信度从高到低退：
 *
 * 1. **有 base 就比 base**（`syncedFingerprint`）。这是唯一精确的答案。
 * 2. **没有 base 就退回布尔 `synced`**。=1 的意思正是"上次推完到现在没人写过这一行"，
 *    也就是 local == base，只是我们没把 base 存下来。
 *    加指纹那次迁移之后，老设备上每一行的 base 都是空的，全靠这一级兜住——
 *    少了它，升级后的第一次同步会把**所有**行都判成"本地改过"，云端的改动一条都下不来。
 * 3. **两样都没有（从没推过的新设备）就看它还是不是出厂的样子**。刚 seed 完的默认分类
 *    应该老老实实接受云端那份用户整理过的版本；已经改过的则是这台手机上的真实数据，留着。
 *
 * 三级都退完还判不了的情况不存在：第三级总有一个确定的答案。
 */
export function isUntouchedSinceSync(
  row: { syncedFingerprint: string | null; synced: number },
  fingerprint: string,
  isAsShipped: () => boolean,
): boolean {
  if (row.syncedFingerprint !== null) return row.syncedFingerprint === fingerprint;
  if (row.synced === 1) return true;
  return isAsShipped();
}

export function accountFingerprint(row: AccountFingerprintRow): string {
  return JSON.stringify([
    row.id,
    row.name,
    row.type,
    row.currency,
    Number(row.openingBalance ?? 0),
    row.icon ?? null,
  ]);
}
