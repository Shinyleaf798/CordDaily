import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import type { ImportPlan, ImportResult } from '@/db/backup';
import { useTheme } from '@/hooks/use-theme';

/**
 * 恢复的两块内容：**预览**（干跑算出来的数）和**结果**（真写进去的数）。
 *
 * 抽出来是因为它们现在有两个宿主：卡上那个「恢复」按钮弹出来的云端弹层，
 * 和「数据 → 从文件恢复」那条路由。两份拷贝的话，预览上承诺的口径和结果页兑现的口径
 * 会慢慢对不上——而这两屏摆在一起看本来就是为了对照。
 *
 * 结果页的字段顺序**刻意跟预览一致**：用户上一屏刚读过一遍，下一屏原位置兑现，
 * 不用重新找。
 */

export function RestorePreview({ sourceLabel, plan }: { sourceLabel: string; plan: ImportPlan }) {
  const theme = useTheme();
  const created = plan.categories.filter((item) => item.action === 'create').length;
  const matched = plan.categories.filter((item) => item.action === 'matched').length;

  return (
    <View style={styles.stack}>
      <View style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
        <Ionicons name="document-text-outline" size={20} color={theme.cardHighlight} />
        <View style={styles.rowText}>
          <ThemedText type="default" numberOfLines={1}>
            {sourceLabel}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {new Date(plan.bundle.exportedAt).toLocaleString()} 导出
          </ThemedText>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="small" themeColor="textSecondary">
          恢复后会发生什么
        </ThemedText>
        <Line label="新增账单" value={`+ ${plan.newTransactions}`} />
        <Line label="已存在，跳过" value={String(plan.duplicateTransactions)} />
        <Line label="新增分类" value={`+ ${created}`} />
        <Line label="对齐到本地已有分类" value={String(matched)} />
        <Line label="新增账户" value={`+ ${plan.newAccounts}`} />
        <Line label="月预算" value={plan.budgetToRestore ? `恢复 ${plan.budgetToRestore}` : '不覆盖'} />
      </View>

      {/* 空库快路径值得说出来：这时候本地那些默认分类没人引用，
          整张字典原样采用来源里的版本，连改过的名字和停用状态都会回来 */}
      <ThemedText type="small" themeColor="textSecondary">
        {plan.adoptWholesale
          ? '这台手机还没有账单，会直接采用备份里的分类，包括你改过的名字和停用状态。'
          : '这台手机已经有账了，本地现有的分类保持原样；备份里多出来的才会新建。'}
      </ThemedText>
    </View>
  );
}

export function RestoreResult({ result }: { result: ImportResult }) {
  const theme = useTheme();

  return (
    <View style={styles.stack}>
      <View style={[styles.check, { borderColor: theme.cardHighlight }]}>
        <Ionicons name="checkmark" size={26} color={theme.cardHighlight} />
      </View>
      <ThemedText type="default" style={styles.center}>
        {result.transactions} 笔账单已恢复
      </ThemedText>

      <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
        <Line label="新增账单" value={String(result.transactions)} />
        <Line label="重复跳过" value={String(result.skipped)} />
        <Line label="新增分类" value={String(result.categories)} />
        <Line label="新增账户" value={String(result.accounts)} />
        {result.budgetRestored ? <Line label="月预算已恢复" value={String(result.budgetRestored)} /> : null}
      </View>

      <ThemedText type="small" themeColor="textSecondary">
        这些记录现在都标成「未备份」，等你下次备份时再推上去。服务器按 id 去重，
        就算以前推过也不会变成两份。
      </ThemedText>
    </View>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.line}>
      <ThemedText type="default">{label}</ThemedText>
      <ThemedText type="default" themeColor="textSecondary">
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.three },
  center: { textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: 12,
  },
  rowText: { flex: 1, gap: 2 },
  card: { padding: Spacing.three, borderRadius: 12, gap: Spacing.two },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  check: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
});
