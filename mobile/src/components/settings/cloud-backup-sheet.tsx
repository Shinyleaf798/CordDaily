import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ModalHost } from '@/components/ui/modal-host';
import { ModalSheet, useSheetTransition } from '@/components/ui/modal-sheet';
import { TaskDialog } from '@/components/ui/task-dialog';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { type PendingCounts } from '@/db/backup';
import { describeError, type PushResult } from '@/db/sync';
import { usePendingDeletions, usePushToCloud } from '@/hooks/use-backup';
import { useTask } from '@/hooks/use-task';
import { useTheme } from '@/hooks/use-theme';

type CloudBackupSheetProps = {
  /** 待推送的记录，按种类分开（内置分类和账户不在里面，见 db/backup.ts 的 PendingCounts） */
  pending: PendingCounts;
  /** 内置分类和账户里还没上过云端的条数。**不显示这个数**，只用来决定那句脚注要不要出现 */
  builtins: number;
  onDismiss: () => void;
};

// 只列有东西的那几行：一个全零的清单除了占地方什么都不说。
// 标签不写「我建的分类」——自带的那批由底下的脚注交代，清单里不用再自辩一次
const KIND_ORDER: { key: keyof PendingCounts; label: string }[] = [
  { key: 'transactions', label: '账单' },
  { key: 'categories', label: '分类' },
  { key: 'accounts', label: '账户' },
  { key: 'transfers', label: '转账' },
  { key: 'recurring', label: '周期规则' },
];

/**
 * 点「备份到云端」之后的确认层。
 *
 * 这一层的存在只为一件事：**删除是不可逆的，得先说清楚再做**。
 * 新增的记录推错了顶多多一份，删错了就真没了——所以那些"会从云端删掉"的条目
 * 逐条列出来、带名字，而且给一个能取消的勾。
 *
 * 勾**默认是打开的**：备份的通常含义就是让云端跟本地一致。
 * 取消勾选不等于放弃那些删除——墓碑留着，下次备份会再问一次（见 db/deletions.ts）。
 *
 * 这里不再问"去云端还是导成文件"。两者被拆成了两个入口：这个按钮只管云端，
 * 导出成文件在「数据」组里单独一行——每次备份都先做一道选择题太烦，
 * 而那道题的答案几乎永远是云端。
 *
 * 清单**逐种类列**（账单 / 分类 / 账户 / …），只列非零的，加起来正好是卡上那个「未备份」。
 *
 * **App 自带的那批分类和账户不进清单，只在最底下用一句话交代**。它们不是用户能决定要不要传的
 * 东西——云端得先有这一行，账单的外键才落得下——给它一个数字，就是请人去核对一个他管不着的数。
 * 曾经它们是混在总数里的：空账本点进来看到"要上传的记录 30 条"，而卡上写着"全部已备份"。
 * 但也不能只字不提，不然用户以后翻云端会发现多出一堆自己没建过的分类。
 */
export function CloudBackupSheet({ pending, builtins, onDismiss }: CloudBackupSheetProps) {
  const theme = useTheme();
  const sheet = useSheetTransition(onDismiss, 0.75);
  const { data: deletions = [] } = usePendingDeletions();
  const [withDeletions, setWithDeletions] = useState(true);

  const pushToCloud = usePushToCloud();
  const task = useTask();
  const lines = KIND_ORDER.filter((kind) => pending[kind.key] > 0);
  const nothingToDo = lines.length === 0 && deletions.length === 0;

  const handleConfirm = () => {
    void task.run<PushResult>(
      {
        running: '正在备份到云端…',
        success: (result) => ({ message: '备份完成', detail: describePush(result) }),
        // 同步失败的原因大半在网络和服务器那边，describeError 已经把它们翻成人话了
        describeError,
      },
      () => pushToCloud.mutateAsync({ withDeletions }),
    );
  };

  // 成功之后关掉整个弹层：这件事已经做完了，退回那张清单没有任何意义
  // （上面的数字全变成 0）。失败则只收掉这张结果卡，清单留在原地好让人直接重试。
  const handleTaskDismiss = () => {
    const succeeded = task.state?.status === 'success';
    task.dismiss();
    if (succeeded) onDismiss();
  };

  // 开跑之后这一层的内容**整个换成**结果卡，而不是在它上面再叠一层 Modal——
  // 原生 Modal 套 Modal 在 iOS 上会让外层闪一下（见 transaction-detail-sheet 的注释）。
  // 换掉之后顺带解决了"跑到一半点空白把它关了"：这张卡运行中不响应遮罩，
  // 而 onRequestClose 挡住的是 Android 的实体返回键，两条退路都堵上了
  if (task.state) {
    const state = task.state;
    return (
      <ModalHost visible onRequestClose={() => (state.status === 'running' ? undefined : handleTaskDismiss())}>
        <TaskDialog state={state} onDismiss={handleTaskDismiss} />
      </ModalHost>
    );
  }

  return (
    <ModalHost visible animation="none" onRequestClose={() => sheet.close()}>
      <ModalSheet title="备份到云端" transition={sheet}>
        <ScrollView contentContainerStyle={styles.body}>
          {/* 清单里只有用户自己的东西，这几行加起来就是卡上那个「未备份」 */}
          <View style={[styles.card, { backgroundColor: theme.background }]}>
            {lines.length ? (
              lines.map((kind) => (
                <View key={kind.key} style={styles.line}>
                  <ThemedText type="default">要上传的{kind.label}</ThemedText>
                  <ThemedText type="default" themeColor="textSecondary">
                    {pending[kind.key]} 条
                  </ThemedText>
                </View>
              ))
            ) : (
              // 没东西要传时也得有一行，不然卡片是空的。说「账单」不说「记录」——
              // 用户来这儿想的就是账单，"记录"是我们的词
              <View style={styles.line}>
                <ThemedText type="default">要上传的账单</ThemedText>
                <ThemedText type="default" themeColor="textSecondary">
                  0 条
                </ThemedText>
              </View>
            )}
            <View style={styles.line}>
              <ThemedText type="default">要从云端删掉的</ThemedText>
              <ThemedText type="default" themeColor={deletions.length ? 'expense' : 'textSecondary'}>
                {deletions.length} 条
              </ThemedText>
            </View>
          </View>

          {deletions.length ? (
            <>
              {/* 勾选行就是那个开关本身，整行可点——一个 16px 的方块太难点中 */}
              <Pressable
                onPress={() => setWithDeletions((current) => !current)}
                style={[styles.row, { backgroundColor: theme.background }]}>
                <View
                  style={[
                    styles.checkbox,
                    {
                      borderColor: withDeletions ? theme.cardHighlight : theme.backgroundSelected,
                      backgroundColor: withDeletions ? theme.cardHighlight : 'transparent',
                    },
                  ]}>
                  {withDeletions ? (
                    <Ionicons name="checkmark" size={14} color={theme.onCardHighlight} />
                  ) : null}
                </View>
                <View style={styles.rowText}>
                  <ThemedText type="default">同时在云端删除这 {deletions.length} 条</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    不勾也没关系，它们会留到下次备份再问你一次
                  </ThemedText>
                </View>
              </Pressable>

              <View style={[styles.card, { backgroundColor: theme.background }]}>
                {deletions.map((deletion) => (
                  <View key={`${deletion.kind}-${deletion.id}`} style={styles.line}>
                    <ThemedText type="small" numberOfLines={1} style={styles.grow}>
                      {deletion.label}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {KIND_LABELS[deletion.kind]}
                    </ThemedText>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          <Pressable
            onPress={handleConfirm}
            disabled={nothingToDo}
            style={[styles.primary, { backgroundColor: theme.cardHighlight }, nothingToDo && styles.dimmed]}>
            <ThemedText type="default" style={{ color: theme.onCardHighlight }}>
              {nothingToDo ? '云端已经是最新的' : '开始备份'}
            </ThemedText>
          </Pressable>

          {/* 骨架只在这里交代一句，**不给数字**：它不是用户能决定要不要传的东西，
              给个数字就等于请人去核对一个他管不着的数（那 30 条正是这一版要消灭的困惑）。
              但也不能只字不提——不然以后翻云端会发现多出一堆自己没建过的分类。
              `builtins > 0` 才显示：推完一次之后它们就在云端了，这句话也就不再成立 */}
          {builtins > 0 && !nothingToDo ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.footnote}>
              App 自带的分类和账户也会跟着一起上去——云端要先有它们，才认得出每笔账记在哪。
            </ThemedText>
          ) : null}
        </ScrollView>
      </ModalSheet>
    </ModalHost>
  );
}

const KIND_LABELS = { transaction: '账单', category: '分类', account: '账户' } as const;

/**
 * 备份完成那句话。只报**用户认得的东西**——账单、自己建的分类和账户、转账、周期规则，
 * 内置分类那一批不提（理由跟上面清单里不列它们是同一条）。
 * 一条都没动时给一句话而不是一串 0：那说明云端本来就是最新的。
 *
 * **导出去给「数据备份与恢复」页用**：那一页在没有待删除项时直接跑备份、不开这一层，
 * 但两条路跑完都该说同一句话。留在这个文件里是因为它描述的是这张确认层承诺的口径。
 */
export function describePush(result: PushResult): string {
  // 从云端下来的东西排在最前面：这次备份里唯一**改变了这台手机**的事，
  // 用户抬头就该看见，而不是在一串上传数字后面找
  const pulled = [
    result.merged ? `更新了 ${result.merged} 个分类/账户` : null,
    result.pulled ? `补回 ${result.pulled} 个` : null,
    // 图片单独报：它是这条路上唯一明显花时间和流量的东西，
    // 也是用户最可能专门盯着看有没有成功的那一样
    result.pulledIcons ? `下载了 ${result.pulledIcons} 张图标` : null,
  ].filter(Boolean);

  const parts = [
    result.transactions ? `${result.transactions} 笔账单` : null,
    result.transfers ? `${result.transfers} 条转账` : null,
    result.recurring ? `${result.recurring} 条周期规则` : null,
    // 图标报出来，虽然它不是"一条记录"：传图片是这次备份里唯一花了明显时间和流量的事，
    // 不说的话用户只会觉得"今天怎么这么慢"
    result.icons ? `${result.icons} 张分类图标` : null,
  ].filter(Boolean);

  const uploaded = parts.length ? `上传了 ${parts.join('、')}` : '没有新的记录要传';
  const lines = [pulled.length ? `从云端${pulled.join('、')}` : null, uploaded].filter(Boolean);
  const base = lines.join('；');
  const withDeletions = result.deletions ? `${base}，从云端删掉 ${result.deletions} 条` : base;

  // 冲突必须逐条点名。只说"有 2 处冲突"的话，用户没法知道要去哪儿核对，
  // 而保留本地这个结果意味着另一台设备上的那次修改这轮没生效
  return result.conflicts.length
    ? `${withDeletions}。「${result.conflicts.join('」「')}」两边都改过，这次保留了这台手机上的版本`
    : withDeletions;
}

const styles = StyleSheet.create({
  body: { gap: Spacing.two, paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  grow: { flex: 1 },
  card: { borderRadius: 12, padding: Spacing.three, gap: Spacing.two },
  // 脚注往里收一点：它不是清单的一行，是整张弹层的注脚
  footnote: { paddingHorizontal: Spacing.one, paddingBottom: Spacing.two },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.three, borderRadius: 12 },
  rowText: { flex: 1, gap: 2 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimmed: { opacity: 0.45 },
  primary: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.one,
  },
});
