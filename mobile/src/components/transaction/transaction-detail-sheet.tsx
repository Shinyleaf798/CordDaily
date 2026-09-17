import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CategoryIcon } from '@/components/category/category-icon';
import { DialogActions, ModalDialog } from '@/components/ui/modal-dialog';
import { ModalHost } from '@/components/ui/modal-host';
import { ModalSheet, useSheetTransition } from '@/components/ui/modal-sheet';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useDeleteTransaction, useDuplicateTransaction, useTransaction } from '@/hooks/use-transactions';
import { useTheme } from '@/hooks/use-theme';
import { formatDateTimeLabel } from '@/utils/date';
import { formatCurrency } from '@/utils/format';

type TransactionDetailSheetProps = {
  transactionId: string;
  onDismiss: () => void;
};

/**
 * 点一笔账单弹出的详情层：上半部分是这笔账的全貌，底部一行三个动作——编辑 / 复制 / 删除。
 *
 * 为什么是底部弹层而不是整页详情：看一笔账是"瞄一眼确认是不是这笔"，不是一次阅读。
 * 盖掉整屏会让人失去"我刚才在列表的哪个位置"的感觉，回来还得重新找。
 *
 * 删除确认**不再套一层 Modal**，而是在同一个 ModalHost 里把内容换成对话框。
 * 原生 Modal 套原生 Modal 在 iOS 上会出现里层关掉、外层跟着闪一下的毛病，
 * 而且从体验上讲，"确认删除"本来就该接管这一层，不是在它上面再叠一层。
 */
export function TransactionDetailSheet({ transactionId, onDismiss }: TransactionDetailSheetProps) {
  const theme = useTheme();
  const { data: transaction, isPending } = useTransaction(transactionId);
  const duplicateTransaction = useDuplicateTransaction();
  const deleteTransaction = useDeleteTransaction();

  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const sheet = useSheetTransition(onDismiss, 0.65);

  const handleEdit = () => {
    // 先关弹层再跳页：Modal 是独立原生窗口，还开着就导航的话会浮在记账表单上面
    sheet.close(() => {
      onDismiss();
      router.push({ pathname: '/add', params: { id: transactionId } });
    });
  };

  const handleDuplicate = () => {
    duplicateTransaction.mutate(transactionId, { onSuccess: () => sheet.close() });
  };

  const handleDelete = () => {
    // 删完关掉弹层就回到首页——列表由 invalidateAll 自己刷新，不用手动导航
    deleteTransaction.mutate(transactionId, { onSuccess: onDismiss });
  };

  if (isConfirmingDelete) {
    return (
      <ModalHost visible onRequestClose={() => setIsConfirmingDelete(false)}>
        <ModalDialog title="删除这笔账单" onDismiss={() => setIsConfirmingDelete(false)}>
          <ThemedText themeColor="textSecondary">
            {transaction ? `「${transaction.title}」${formatCurrency(transaction.amount)}，` : ''}
            删掉之后不能恢复。
          </ThemedText>
          {deleteTransaction.error ? (
            <ThemedText type="small" style={{ color: theme.expense }}>
              删不掉：{deleteTransaction.error.message}
            </ThemedText>
          ) : null}
          <DialogActions
            confirmLabel="删除"
            destructive
            onCancel={() => setIsConfirmingDelete(false)}
            onConfirm={handleDelete}
            confirmDisabled={deleteTransaction.isPending}
          />
        </ModalDialog>
      </ModalHost>
    );
  }

  return (
    <ModalHost visible animation="none" onRequestClose={() => sheet.close()}>
      <ModalSheet transition={sheet}>
        {isPending || !transaction ? (
          <View style={styles.loading}>
            <ActivityIndicator color={theme.cardHighlight} />
          </View>
        ) : (
          <>
            <View style={styles.header}>
              <View style={[styles.iconWrap, { backgroundColor: theme.background }]}>
                <CategoryIcon icon={transaction.categoryIcon} size={24} />
              </View>
              <View style={styles.headerText}>
                <ThemedText type="default" numberOfLines={1}>
                  {transaction.title}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {transaction.categoryName ?? '未分类'}
                </ThemedText>
              </View>
              {/* 收入才染绿，支出用普通文字色：账本里九成是支出，全标红等于整屏都在报警 */}
              <ThemedText
                style={[styles.amount, transaction.type === 'INCOME' && { color: theme.income }]}>
                {transaction.type === 'INCOME' ? '+' : '-'}
                {formatCurrency(transaction.amount)}
              </ThemedText>
            </View>

            <ScrollView style={styles.fields} contentContainerStyle={styles.fieldsContent}>
              {/* 昨天 9月16号 16:00：相对词负责快速定位，绝对日期和时刻负责说准，缺一个都答不全
                  "这笔到底是什么时候的" */}
              <DetailRow label="日期" value={formatDateTimeLabel(new Date(transaction.date))} />
              <DetailRow label="账户" value={transaction.accountName ?? '已删除的账户'} />
              {/* 没填的字段整行不出现，而不是显示"—"：空占位只会把真正填了的内容挤下去 */}
              {transaction.merchant ? <DetailRow label="店名" value={transaction.merchant} /> : null}
              {transaction.location ? <DetailRow label="地点" value={transaction.location} /> : null}
              {transaction.remarks ? <DetailRow label="备注" value={transaction.remarks} /> : null}
              {transaction.tags.length > 0 ? <DetailRow label="标签" value={transaction.tags.join('、')} /> : null}
              {transaction.isReimbursable ? (
                <DetailRow label="报销" value={transaction.reimbursedAt ? '已收回' : '待收回'} />
              ) : null}
              {transaction.excludeFromStats ? <DetailRow label="统计" value="不计入" /> : null}
            </ScrollView>

            {duplicateTransaction.error ? (
              <ThemedText type="small" style={{ color: theme.expense }}>
                没能复制：{duplicateTransaction.error.message}
              </ThemedText>
            ) : null}

            {/* 三个动作做成一条分段控件：整条轨道用 tabTrackBackground，
                跟弹层本身的 backgroundElement 拉开一级色差，所以这一组按钮是"浮"在账单信息上面的，
                不会被当成详情的又一行。三个按钮各自的底色/字色再把主次分开 */}
            <View style={[styles.actionTabs, { backgroundColor: theme.tabTrackBackground }]}>
              <ActionTab
                icon="create-outline"
                label="编辑"
                onPress={handleEdit}
                background={theme.cardHighlight}
                tint={theme.onCardHighlight}
              />
              <ActionTab
                icon="copy-outline"
                label="复制"
                onPress={handleDuplicate}
                disabled={duplicateTransaction.isPending}
                background={theme.background}
                tint={theme.text}
              />
              {/* 删除不用红底白字：三套主题的 expense 里有两个是浅红，白字压不住。
                  红字配普通底色一样刺眼，而且不会有对比度问题 */}
              <ActionTab
                icon="trash-outline"
                label="删除"
                onPress={() => setIsConfirmingDelete(true)}
                background={theme.background}
                tint={theme.expense}
              />
            </View>
          </>
        )}
      </ModalSheet>
    </ModalHost>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.detailLabel}>
        {label}
      </ThemedText>
      <ThemedText type="small" style={styles.detailValue}>
        {value}
      </ThemedText>
    </View>
  );
}

// 三个动作跟弹层放同一个文件：它只服务于这一个弹层，
// 拆成单独文件只会让"想加一个动作要改几个文件"变得更难回答。
// 底色和字色由调用方给，不在这里按 label 判断——那样加第四个动作就得回来改这个组件
function ActionTab({
  icon,
  label,
  onPress,
  disabled,
  background,
  tint,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  disabled?: boolean;
  background: string;
  tint: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.actionTab, { backgroundColor: background }, disabled && styles.actionDisabled]}>
      <Ionicons name={icon} size={20} color={tint} />
      <ThemedText type="small" style={{ color: tint, fontWeight: '600' }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  loading: {
    paddingVertical: Spacing.five,
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  amount: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '700',
  },
  fields: {
    // 上限而不是固定高度：只有日期和账户两行时，弹层跟着缩到那两行的高度
    maxHeight: 200,
  },
  fieldsContent: {
    paddingVertical: Spacing.two,
    gap: Spacing.two,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  detailLabel: {
    width: 48,
  },
  detailValue: {
    flex: 1,
  },
  actionTabs: {
    flexDirection: 'row',
    gap: Spacing.half,
    borderRadius: 14,
    padding: Spacing.half,
    marginTop: Spacing.one,
  },
  actionTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    height: 44,
    borderRadius: 12,
  },
  actionDisabled: {
    opacity: 0.4,
  },
});
