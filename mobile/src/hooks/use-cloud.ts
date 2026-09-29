import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  claimLegacyBook,
  loginCloudAccount,
  probeAccounts,
  registerCloudAccount,
  signOutCloud,
} from '@/db/neon/account';
import {
  connectRemote,
  disconnectRemote,
  fetchRemoteStatus,
  getRemoteIdentity,
  hasRemote,
} from '@/db/neon/client';
import { getCloudSession } from '@/db/neon/session';

/**
 * 「云端备份」那一页要的数据。
 *
 * 分得这么细是有意的：**「连没连库」「登没登账号」「云端有多少」是三个不同的问题，
 * 前两个手机自己就知道（飞行模式下也知道），第三个才要发请求。** 合成一个的话，
 * 「我的」页那张备份卡上的按钮文字会跟着一次网络请求的成败闪。
 */

/** 配没配过连接串。只读 SecureStore，不发请求 */
export function useHasRemote() {
  return useQuery({ queryKey: ['hasRemote'], queryFn: hasRemote });
}

/** 登没登云端账号。同样只读 SecureStore——备份卡和自动同步那一行拿它决定能不能点 */
export function useCloudSession() {
  return useQuery({ queryKey: ['cloudSession'], queryFn: getCloudSession });
}

/**
 * 库里现在有没有账号：空的就该注册，有占位行就该认领，有正式账号就该登录。
 *
 * **要发请求**，所以只在连上库之后、还没登录的时候查一次。`enabled` 交给调用方，
 * 免得没连库的时候也去查（那会抛「还没连接云端数据库」）。
 */
export function useAccountProbe(enabled: boolean) {
  return useQuery({ queryKey: ['cloudAccountProbe'], queryFn: probeAccounts, enabled, retry: false });
}

/**
 * 云端现在是什么状况（主机、账本 id、有多少条）。**要发请求**，所以只在云端页用。
 *
 * `retry: false`：连不上的时候要立刻把错误显示出来，而不是让用户对着转圈等三次重试。
 * 连接串错了、库被删了、手机没网——这三种都该马上说。
 */
export function useRemoteStatus() {
  return useQuery({ queryKey: ['remoteStatus'], queryFn: fetchRemoteStatus, retry: false });
}

/** 连的是哪个云端 + 哪本账，本地就答得出的那种。不发请求——它跑在冷启动路径上 */
export function useRemoteIdentity() {
  return useQuery({ queryKey: ['remoteIdentity'], queryFn: getRemoteIdentity });
}

/**
 * 连接（或重连）。成功之后**把整个缓存全部失效**，不逐个列 key：
 * 换一个云端等于换了一整套"云端是什么样"的答案——备份卡、自动同步页、恢复层里那个
 * 「云端有 N 笔」全都过期了。逐个列迟早会漏一个，而漏掉的那个会显示上一个库的数字。
 *
 * 下面四个改登录态的 mutation 出于同样的理由，也都是整片失效。
 */
export function useConnectRemote() {
  return useInvalidatingMutation((connectionString: string) => connectRemote(connectionString));
}

export function useDisconnectRemote() {
  return useInvalidatingMutation(disconnectRemote);
}

export function useRegisterCloudAccount() {
  return useInvalidatingMutation((input: Credentials) => registerCloudAccount(input.email, input.password));
}

export function useLoginCloudAccount() {
  return useInvalidatingMutation((input: Credentials) => loginCloudAccount(input.email, input.password));
}

/** 给旧版自动建的那本账补上邮箱密码。id 不变，所以已经推上去的账单一条都不会掉 */
export function useClaimLegacyBook() {
  return useInvalidatingMutation((input: Credentials) => claimLegacyBook(input.email, input.password));
}

export function useSignOutCloud() {
  return useInvalidatingMutation(signOutCloud);
}

type Credentials = { email: string; password: string };

function useInvalidatingMutation<TInput, TOutput>(mutationFn: (input: TInput) => Promise<TOutput>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn, onSuccess: () => queryClient.invalidateQueries() });
}
