import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ModalDialog } from '@/components/ui/modal-dialog';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * 一件要等的事现在处于什么状态。三态是封闭的——一件事要么在跑，要么成了，要么砸了，
 * 没有第四种；用 `{ isLoading, isError, data }` 那种组合表示的话，
 * 就会出现 `isLoading && isError` 这类界面上根本没有对应画面的状态。
 */
export type TaskState =
  | { status: 'running'; message: string }
  | { status: 'success'; message: string; detail?: string }
  | { status: 'error'; message: string; detail?: string };

type TaskDialogProps = {
  state: TaskState;
  /** 成功/失败时点按钮或遮罩调什么。运行中这个回调不会被触发 */
  onDismiss: () => void;
};

/**
 * 「正在做一件要等的事」以及它的结局。备份、恢复、导出都用它。
 *
 * 放 `ui/` 是因为它不认识任何业务概念——它只知道"有一件事在跑"，
 * 至于跑的是备份还是恢复，全在调用方传进来的那几句话里。
 *
 * **运行中点不掉**：遮罩不响应点击（`dismissOnBackdropPress={false}`），也不给取消按钮。
 * 这不是偷懒——备份和恢复都在写库，中途放手会留下一个推了一半 / 写了一半的状态，
 * 而"取消"要做到名副其实，得能回滚已经发出去的那些请求。与其给一个骗人的取消键，
 * 不如老实把这几秒锁住。Android 的实体返回键由调用方在 ModalHost 上一起挡掉。
 *
 * **不套 Modal**：跟 `ModalDialog` 一样，它是"内容"，外面那层壳由调用方的 ModalHost 提供。
 * 原生 Modal 套原生 Modal 在 iOS 上会出现里层关掉、外层跟着闪一下的毛病
 * （见 transaction-detail-sheet 的同一条注释）。所以弹层里要显示它，
 * 是把那一层的内容**换成**它，而不是在它上面再叠一层。
 */
export function TaskDialog({ state, onDismiss }: TaskDialogProps) {
  const theme = useTheme();
  const isRunning = state.status === 'running';

  return (
    <ModalDialog onDismiss={isRunning ? () => {} : onDismiss} dismissOnBackdropPress={!isRunning}>
      <View style={styles.body}>
        {isRunning ? (
          <ActivityIndicator size="large" color={theme.cardHighlight} />
        ) : (
          <Ionicons
            name={state.status === 'success' ? 'checkmark-circle' : 'alert-circle'}
            size={44}
            // 成功借用收入色、失败借用支出色：整个 App 里"好事是绿的、坏事是红的"已经建立起来了，
            // 再引两个只在这里用的颜色，等于让用户多学一套
            color={state.status === 'success' ? theme.income : theme.expense}
          />
        )}

        <ThemedText type="default" style={styles.message}>
          {state.message}
        </ThemedText>

        {!isRunning && state.detail ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.message}>
            {state.detail}
          </ThemedText>
        ) : null}
      </View>

      {/* 运行中不给按钮。留一个灰掉的按钮只会让人一直去点它 */}
      {isRunning ? null : (
        <Pressable onPress={onDismiss} style={[styles.button, { backgroundColor: theme.cardHighlight }]}>
          <ThemedText type="default" style={{ color: theme.onCardHighlight }}>
            {state.status === 'success' ? '完成' : '知道了'}
          </ThemedText>
        </Pressable>
      )}
    </ModalDialog>
  );
}

const styles = StyleSheet.create({
  // 竖着居中排：图标/转圈是这张卡的主角，文字是它的说明
  body: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  message: {
    textAlign: 'center',
  },
  button: {
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
