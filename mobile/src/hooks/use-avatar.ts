import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { clearAvatar, getAvatarUri, pickAvatar } from '@/db/avatar';

/**
 * 账号头像。三个 hook 共用一个 key，所以换完图「我的」页顶上那张卡会自己更新——
 * 头像出现在两个页面（账号页和「我的」页顶部），各自读各自的话总有一个是旧的。
 */

export function useAvatar() {
  return useQuery({ queryKey: ['avatar'], queryFn: getAvatarUri });
}

/**
 * 挑一张新头像。用户在系统选择器里取消时 `pickAvatar` 返回 null，
 * 这里**不当错误**——那是正常操作，报一句「换头像失败」只会让人困惑。
 */
export function usePickAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: pickAvatar,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['avatar'] }),
  });
}

export function useClearAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: clearAvatar,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['avatar'] }),
  });
}
