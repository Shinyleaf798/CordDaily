import { router } from 'expo-router';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MePage } from '@/components/settings/me-page';
import { DialogActions, ModalDialog } from '@/components/ui/modal-dialog';
import { ModalHost } from '@/components/ui/modal-host';
import { ThemedText } from '@/components/ui/themed-text';
import { useHasRemote } from '@/hooks/use-cloud';
import { useTheme } from '@/hooks/use-theme';

/**
 * 「我的」页的路由层：内容在 components/settings/me-page，这一层只持有"先连一个数据库"那个对话框。
 */
export default function SettingsScreen() {
  const theme = useTheme();
  const { data: hasRemote } = useHasRemote();

  const [showConnectFirst, setShowConnectFirst] = useState(false);

  /**
   * 顶部那条和「账号」那一行的去处。
   *
   * 连接串还没填的时候**先弹一句再走**，不直接把人推进账号页：那一页在这种状态下
   * 只会说一句「还没有账号」再给一个跳去别处的按钮，等于用一整屏说一句话。
   * 弹窗把这句话原地说完，还留了一个「取消」——点头像的人未必是来配置云端的。
   */
  const openAccount = () => {
    if (hasRemote) router.push('/settings/account');
    else setShowConnectFirst(true);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'left', 'right']}>
      <MePage onOpenAccount={openAccount} />

      {/* 用自家的对话框而不是 Alert.alert：Alert 是系统画的，不认这个 App 的主题色、
          圆角和字体，深色模式下尤其显眼。这一层跟备份、恢复、恢复提示用的是同一套壳 */}
      {showConnectFirst ? (
        <ModalHost visible onRequestClose={() => setShowConnectFirst(false)}>
          <ModalDialog title="先连一个数据库" onDismiss={() => setShowConnectFirst(false)}>
            <ThemedText type="small" themeColor="textSecondary">
              账号是建在你自己的 Neon 库里的，所以得先把库连上。
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              记账、统计、导出文件都不需要这一步，现在就能用。
            </ThemedText>
            <DialogActions
              confirmLabel="去连接"
              onCancel={() => setShowConnectFirst(false)}
              onConfirm={() => {
                setShowConnectFirst(false);
                router.push('/settings/cloud');
              }}
            />
          </ModalDialog>
        </ModalHost>
      ) : null}
    </SafeAreaView>
  );
}
