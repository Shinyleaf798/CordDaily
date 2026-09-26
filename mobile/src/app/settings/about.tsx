import Constants from 'expo-constants';
import { useState } from 'react';
import { DevSettings, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DialogActions, ModalDialog } from '@/components/ui/modal-dialog';
import { ModalHost } from '@/components/ui/modal-host';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { ScreenPadding, Spacing } from '@/constants/theme';
import { resetLocalDatabase } from '@/db/client';
import { useTheme } from '@/hooks/use-theme';

/**
 * 关于。放三样东西：版本号（出问题时要报的第一个数）、
 * 一句说清楚"你的账在哪儿"（本地优先的 App 最该让用户知道的事），
 * 以及一个**只在开发版出现**的清库按钮。
 */
export default function AboutScreen() {
  const theme = useTheme();
  const version = Constants.expoConfig?.version ?? '开发版';
  const [isConfirming, setIsConfirming] = useState(false);

  const handleReset = async () => {
    await resetLocalDatabase();
    // 删完必须重启：内存里那些 React Query 缓存还端着刚被删掉的数据，
    // 而默认分类是在根布局的 useEffect 里灌的，只有重新挂载才会跑
    DevSettings.reload();
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['bottom', 'left', 'right']}>
      <ThemedView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="small" themeColor="textSecondary">
              版本
            </ThemedText>
            <ThemedText type="default">{version}</ThemedText>
          </View>

          <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="small" themeColor="textSecondary">
              你的账在哪儿
            </ThemedText>
            <ThemedText type="small">
              全部记在这台手机本地。只有你点了「备份」，或者打开了自动同步，它们才会被送到云端。
              换手机或重装之前，记得先导出一份备份文件。
            </ThemedText>
          </View>

          {/* __DEV__ 在打包出来的正式版里是 false，这一段连同它的代码都会被压掉。
              开发期改数据库结构不写迁移（直接清库重来，见 DECISIONS.md），
              而 Expo Go 下从系统设置清数据会把登录凭证一起抹掉，每次都得重新登录——
              这个按钮只删这一个库文件 */}
          {__DEV__ ? (
            <View style={styles.devBlock}>
              <ThemedText type="small" themeColor="textSecondary">
                开发工具
              </ThemedText>
              <Pressable
                onPress={() => setIsConfirming(true)}
                style={[styles.dangerButton, { borderColor: theme.expense }]}>
                <ThemedText type="default" style={{ color: theme.expense }}>
                  清除本地数据并重启
                </ThemedText>
              </Pressable>
              <ThemedText type="small" themeColor="textSecondary">
                删掉本地 SQLite 库，重启后重新建表、重灌默认分类和账户。登录状态不受影响。
              </ThemedText>
            </View>
          ) : null}
        </ScrollView>
      </ThemedView>

      {isConfirming ? (
        <ModalHost visible onRequestClose={() => setIsConfirming(false)}>
          <ModalDialog title="清除本地数据？" onDismiss={() => setIsConfirming(false)}>
            <ThemedText type="small" themeColor="textSecondary">
              这台手机上的账单、分类、账户、预算会全部删掉，没有备份就找不回来。
              重启后是一个全新的库。
            </ThemedText>
            <DialogActions
              confirmLabel="删掉并重启"
              destructive
              onCancel={() => setIsConfirming(false)}
              onConfirm={handleReset}
            />
          </ModalDialog>
        </ModalHost>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: ScreenPadding, paddingVertical: Spacing.four, gap: Spacing.three },
  card: { padding: Spacing.three, borderRadius: 12, gap: Spacing.one },
  devBlock: { gap: Spacing.two, marginTop: Spacing.three },
  dangerButton: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
