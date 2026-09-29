import { useAuthStore } from '@/store/auth.store';

import { useCloudSession } from './use-cloud';

/**
 * 「我是谁」——给界面显示用的那一个身份。
 *
 * 这个 App 有**两条互不相干的登录**：我那台 Express 后端的账号（`auth.store` 里的 `user`），
 * 和用户自己 Neon 库里的账号（`db/neon/session`）。界面上只需要显示一个，
 * 于是要有一个地方决定显示哪个——就是这里，而不是在三个页面里各写一遍 `??`。
 *
 * **云端账号优先**：备份现在走的是那条路（手机直连用户自己的库），后端那条对绝大多数
 * 用户根本不存在。两个都有的时候显示正在干活的那个。
 *
 * 返回 null 就是真的两条都没有。这时候**照样能记账**（CLAUDE.md 原则 1），
 * 所以拿到 null 的页面该说的是"备份还没地方去"，不是"请先登录"。
 */
export type Identity = {
  email: string;
  /** `cloud` = 用户自己库里的账号，`backend` = 我那台服务器的账号 */
  source: 'cloud' | 'backend';
};

export function useIdentity(): Identity | null {
  const user = useAuthStore((state) => state.user);
  const { data: session } = useCloudSession();

  if (session) return { email: session.email, source: 'cloud' };
  if (user) return { email: user.email, source: 'backend' };
  return null;
}
