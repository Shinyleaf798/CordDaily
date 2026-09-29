import * as SecureStore from 'expo-secure-store';

/**
 * 云端账号的登录态。
 *
 * **它不是「登录了这个 App」，是「在那个库里选中了哪一本账」。** 手机本地的记账、统计、
 * 导出、从文件恢复全都不看这个值——不登录一样能用（CLAUDE.md 原则 1）。它只回答一件事：
 * 往云端推的时候，`userId` 那一列填谁。
 *
 * 跟 store/auth.store 里那个 `user` 是两码事：那个是我那台 Express 后端发的 JWT 会话，
 * 这个是用户自己 Neon 库里 `User` 表的一行。两条路都能让「备份」可用，但互不依赖——
 * 用自己的库备份时我的服务器可以整个不存在。
 *
 * 存 SecureStore 而不是 app_settings：跟连接串一样的理由，那张表会被导出进备份文件。
 * 这里没有 token 可存（没有服务器发 token），存的只是"我是这个库里的哪一行"。
 */

const SESSION_KEY = 'cloudSession';

export type CloudSession = {
  /** `User.id`，也就是所有业务表 `userId` 那一列要填的值 */
  userId: string;
  email: string;
  name: string | null;
  /** 记一下是哪个库的账号，换库之后这条就作废了 */
  host: string;
};

let cached: CloudSession | null | undefined;

export async function getCloudSession(): Promise<CloudSession | null> {
  if (cached !== undefined) return cached;
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  // 存进去的是自己写的 JSON，但解析失败也不能把调用方炸掉——
  // SecureStore 被系统清过一半、或者以后改了字段名，都该退化成「没登录」而不是白屏
  try {
    cached = raw ? (JSON.parse(raw) as CloudSession) : null;
  } catch {
    cached = null;
  }
  return cached;
}

export async function saveCloudSession(session: CloudSession): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
  cached = session;
}

export async function clearCloudSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
  cached = null;
}
