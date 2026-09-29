import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  connectRemote,
  disconnectRemote,
  fetchRemoteStatus,
  getRemoteIdentity,
  hasRemote,
} from '@/db/neon/client';

/**
 * 「云端备份」那一页要的数据。
 *
 * 两个 query 分得很开是有意的：**「连没连」不该依赖网络，「云端有多少」才需要。**
 * 合成一个的话，「我的」页那张备份卡上的按钮文字会跟着一次网络请求的成败闪——
 * 而用户有没有配过连接串，是手机自己就知道的事，飞行模式下也知道。
 */

/** 配没配过。只读 SecureStore，不发请求——备份卡和自动同步那一行的按钮拿它决定文案 */
export function useHasRemote() {
  return useQuery({ queryKey: ['hasRemote'], queryFn: hasRemote });
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

/** 连的是哪个云端，本地就答得出的那种（主机名）。同样不发请求——它跑在冷启动路径上 */
export function useRemoteIdentity() {
  return useQuery({ queryKey: ['remoteIdentity'], queryFn: getRemoteIdentity });
}

/**
 * 连接（或重连）。成功之后**把整个缓存全部失效**，不逐个列 key：
 * 换一个云端等于换了一整套"云端是什么样"的答案——备份卡、自动同步页、恢复层里那个
 * 「云端有 N 笔」全都过期了。逐个列迟早会漏一个，而漏掉的那个会显示上一个库的数字。
 */
export function useConnectRemote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (connectionString: string) => connectRemote(connectionString),
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

export function useDisconnectRemote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: disconnectRemote,
    onSuccess: () => queryClient.invalidateQueries(),
  });
}
