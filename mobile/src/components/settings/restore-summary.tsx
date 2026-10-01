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
 *
 * **清单只留 4 行：账单新增 / 账单跳过 / 分类新增 / 分类更新。**
 * 「保留你改过的」「对齐到本地已有分类」「新增账户」「月预算」都撤了——它们**照做不误**，
 * 只是不再占一行。撤的理由不是嫌长，是这四项**没有一个需要用户拿去核对**：
 * 账户和预算是恢复的附带动作，分类的「保留」和「对齐」是算法内部的分支名，
 * 用户既不认得也无从判断对错。摆成清单的样子，等于请人去验收四个他管不着的数。
 * 真正要他知道的只有一件事——"我改过的会不会被盖掉"——那是下面那句话在说的，
 * 一句人话比一个数字管用。
 *
 * 顺带也让这屏和「备份到云端」那屏对齐：那边是 2~5 行短标签，这边原来 8 行长标签，
 * 两个按钮并排站在同一张卡上，点下去不该掉进两种密度的页面。
 */

export function RestorePreview({ sourceLabel, plan }: { sourceLabel: string; plan: ImportPlan }) {
  const theme = useTheme();
  const created = plan.categories.filter((item) => item.action === 'create').length;
  // 本地已有、而且内容跟包里不一样的。差额（本地已有且完全相同的）不报——
  // 那些行恢复前后一个字都不变，写进清单只是一个恒为"无事发生"的数
  const updated = plan.categories.filter((item) => item.action === 'exists' && item.differs).length;
  // 你在这台手机上改过、还没备份的那些：恢复不动它们，下次推送会把本地那份送上去。
  // 不进清单，只用来决定下面那句话怎么写——它不是一个要核对的数，是一句要读的提醒
  const kept = plan.categories.filter((item) => item.conflict).length;

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
        <Line label="更新本地已有分类" value={String(updated)} />
      </View>

      {/* 覆盖是这一步唯一会"改掉现有东西"的地方，必须说在按下确认之前。
          账单只增不改（重复的跳过），分类不一样——所以这句话点名只说分类 */}
      <ThemedText type="small" themeColor="textSecondary">
        {kept > 0
          ? `有 ${kept} 个分类你在这台手机上改过、还没备份，恢复不会动它们——下次备份时以这台手机的版本为准。其余同 id 的分类按备份里的版本更新。账单只新增，不会被改动。`
          : '同 id 的分类会按备份里的版本更新，但你在这台手机上改过、还没备份的那些会原样保留。账单只新增，不会被改动。'}
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
        <Line label="更新分类" value={String(result.categoriesUpdated)} />
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
