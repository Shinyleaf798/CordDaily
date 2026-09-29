import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { RestoreSheet } from '@/components/settings/restore-sheet';
import { DialogActions, ModalDialog } from '@/components/ui/modal-dialog';
import { ModalHost } from '@/components/ui/modal-host';
import { ThemedText } from '@/components/ui/themed-text';
import { getCloudTransport } from '@/api/cloud-transport';
import { getSetting, setSetting } from '@/db/settings';
import { useCloudSummary, useLocalStats } from '@/hooks/use-backup';
import { useRemoteIdentity } from '@/hooks/use-cloud';
import { useAuthStore } from '@/store/auth.store';

const DISMISSED_KEY = 'restorePromptDismissedFor';

/**
 * 重装或换手机之后，本地空空如也、而云端有账时，问一次要不要拉回来。
 *
 * 不问的话，用户看到的是一个空账本——云端明明有 1,284 笔，但**没有任何地方告诉他**，
 * 他得自己想到去「我的 → 恢复」。重装后以为数据没了，是这个 App 最吓人的一种体验。
 *
 * **只问、不自动拉**。自动拉等于服务器往手机推数据，那条线一越过就是双向同步
 * （同一笔在两台设备都改过听谁的、这边删了那边算不算删），是另一个子系统。
 * 所以这里维持 CLAUDE.md 原则#1 的那个唯一例外：空库 + 用户明确点了恢复。
 *
 * 三个出现条件缺一不可：**云端通了** + **本地一笔账都没有** + **云端有账**。
 *
 * 「云端通了」有两条路：登录了自己那台服务器，或者填了自己的 Neon 连接串。
 * 后者正是**换手机**最主要的走法——新手机上粘一条连接串，这个弹窗就会自己出来，
 * 不需要任何账号（见 app/settings/cloud.tsx）。
 *
 * 跳过之后按"当前连的是哪个云端"记一条，换一个云端还会再问——
 * 那多半是另一个人、或者另一本账，值得再问一次。
 */
export function RestorePrompt() {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const [isRestoring, setIsRestoring] = useState(false);

  const { data: stats } = useLocalStats();
  const isLocalEmpty = stats?.transactions === 0;

  // 只在"登录了而且本地是空的"时才去问云端：这一句会跟着每次启动跑，
  // 平时（本地有账）根本不该发请求
  // 云端目标的身份：登录那条路是 userId，Neon 那条路是主机名。
  // 两条都拿不到就说明还没连上云端，这个弹窗整个不该出现
  const { data: remoteIdentity } = useRemoteIdentity();
  const cloudKey = user?.id ?? remoteIdentity ?? null;

  const { data: summary } = useCloudSummary(!!cloudKey && !!isLocalEmpty);
  const { data: dismissedFor } = useQuery({
    queryKey: ['restorePromptDismissed'],
    queryFn: () => getSetting(DISMISSED_KEY),
  });

  const dismiss = useMutation({
    mutationFn: () => setSetting(DISMISSED_KEY, cloudKey ?? ''),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['restorePromptDismissed'] }),
  });

  const shouldAsk =
    !!cloudKey &&
    !!isLocalEmpty &&
    (summary?.transactions ?? 0) > 0 &&
    dismissedFor !== cloudKey &&
    !isRestoring;

  if (isRestoring) {
    return (
      <RestoreSheet
        sourceLabel="云端"
        load={async () => (await getCloudTransport()).fetchCloudBundle()}
        source="cloud"
        onDismiss={() => {
          setIsRestoring(false);
          // 恢复完（或者中途关掉）都不用再问了：本地已经不是空的，
          // 或者用户已经明确表达过一次意思
          dismiss.mutate();
        }}
      />
    );
  }

  if (!shouldAsk) return null;

  return (
    <ModalHost visible onRequestClose={() => dismiss.mutate()}>
      <ModalDialog title="云端有你的账单" onDismiss={() => dismiss.mutate()} dismissOnBackdropPress={false}>
        <ThemedText type="small" themeColor="textSecondary">
          {summary?.transactions} 笔账单 · {summary?.categories} 个分类 · {summary?.accounts} 个账户。
          这台手机现在是空的，要把它们恢复过来吗？恢复只会新增，不会删掉任何东西。
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          跳过也行，以后在「我的 → 恢复」还能再来；用备份文件恢复在「我的 → 数据」。
        </ThemedText>
        <DialogActions
          cancelLabel="跳过"
          confirmLabel="恢复到这台手机"
          onCancel={() => dismiss.mutate()}
          onConfirm={() => setIsRestoring(true)}
        />
      </ModalDialog>
    </ModalHost>
  );
}
