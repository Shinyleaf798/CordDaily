import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { ScreenPadding, Spacing } from '@/constants/theme';
import { fetchCloudBundle, type CloudSummary } from '@/api/sync';
import { parseBundle, planImport, type ImportPlan, type ImportResult } from '@/db/backup';
import { pickBackupFile } from '@/db/backup-file';
import { describeError } from '@/db/sync';
import { useApplyImport, useCloudSummary } from '@/hooks/use-backup';
import { useTheme } from '@/hooks/use-theme';

/**
 * 恢复。三步一条路：**选来源 → 预览（干跑）→ 完成**。
 *
 * 三步在同一个路由里换状态，而不是三个页面：用户中途想退出，按一次返回就整个离开——
 * 拆成三个路由的话他得连按三次，而中间那两步单独存在也没有意义（没有 plan 的预览页是空的）。
 *
 * **先算清楚、再落库**：`planImport` 跑的是一次干跑，数全部算好了但一条都没写。
 * 「已存在多少笔会跳过」要给用户看见——不然同一个文件点两次会让人心慌，
 * 而它恰恰是幂等的证明（认的是记录 id，见 db/backup.ts）。
 *
 * 两个来源（云端 / 文件）在第一屏分叉，后面两步完全共用——它们拿到的是同一个 bundle 结构
 * （服务器那个接口特意按备份文件的形状返回，见 backend/src/services/sync.service.js）。
 *
 * 「分类对照」那一屏还没做：它只有 CSV 导入和"两台手机各自都记过账"才会用到——
 * 内置分类 id 固定之后，常路上根本不会出现对不上的分类。
 */
export default function RestoreScreen() {
  const theme = useTheme();
  const applyImport = useApplyImport();

  const [fileName, setFileName] = useState<string | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);

  // 一进这一屏就顺手问一句云端有什么，好让那一行直接显示「1,284 笔账单」而不是一个空按钮
  const { data: summary } = useCloudSummary();

  const handlePick = async () => {
    setError(null);
    setIsReading(true);
    try {
      const picked = await pickBackupFile();
      // 取消不是错误：什么都不说，留在这一屏
      if (!picked) return;
      const bundle = await parseBundle(picked.text);
      setFileName(picked.name);
      setPlan(await planImport(bundle));
    } catch (pickError) {
      setError((pickError as Error).message);
    } finally {
      setIsReading(false);
    }
  };

  const handlePickCloud = async () => {
    setError(null);
    setIsReading(true);
    try {
      // 服务器返回的就是一份 bundle，所以后面两步跟文件那条路一模一样
      const bundle = await fetchCloudBundle();
      setFileName(`云端 · 截至 ${new Date().toLocaleDateString()}`);
      setPlan(await planImport(bundle));
    } catch (cloudError) {
      setError(describeError(cloudError));
    } finally {
      setIsReading(false);
    }
  };

  const handleApply = () => {
    if (!plan) return;
    setError(null);
    applyImport.mutate(
      { plan },
      {
        onSuccess: (applied) => setResult(applied),
        onError: (applyError) => setError((applyError as Error).message),
      },
    );
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['bottom', 'left', 'right']}>
      <ThemedView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          {result ? (
            <Done result={result} />
          ) : plan ? (
            <Preview fileName={fileName} plan={plan} />
          ) : (
            <Picker onPick={handlePick} onPickCloud={handlePickCloud} isReading={isReading} summary={summary} />
          )}

          {error ? (
            <ThemedText type="small" style={{ color: theme.expense }}>
              {error}
            </ThemedText>
          ) : null}
        </ScrollView>

        {plan && !result ? (
          <View style={styles.footer}>
            <Pressable
              onPress={handleApply}
              disabled={applyImport.isPending}
              style={[styles.primary, { backgroundColor: theme.cardHighlight }]}>
              {applyImport.isPending ? (
                <ActivityIndicator color={theme.onCardHighlight} />
              ) : (
                <ThemedText type="default" style={{ color: theme.onCardHighlight }}>
                  确认恢复 {plan.newTransactions} 笔
                </ThemedText>
              )}
            </Pressable>
          </View>
        ) : null}

        {result ? (
          <View style={styles.footer}>
            <Pressable
              onPress={() => router.back()}
              style={[styles.primary, { backgroundColor: theme.cardHighlight }]}>
              <ThemedText type="default" style={{ color: theme.onCardHighlight }}>
                完成
              </ThemedText>
            </Pressable>
          </View>
        ) : null}
      </ThemedView>
    </SafeAreaView>
  );
}

type PickerProps = {
  onPick: () => void;
  onPickCloud: () => void;
  isReading: boolean;
  summary: CloudSummary | undefined;
};

function Picker({ onPick, onPickCloud, isReading, summary }: PickerProps) {
  const theme = useTheme();
  return (
    <View style={styles.stack}>
      <ThemedText type="small" themeColor="textSecondary">
        恢复只会新增，不会删掉这台手机上任何已有的账单和分类。已经存在的记录会自动跳过。
      </ThemedText>

      <Pressable
        onPress={onPick}
        disabled={isReading}
        style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
        <Ionicons name="document-outline" size={20} color={theme.cardHighlight} />
        <View style={styles.rowText}>
          <ThemedText type="default">选择备份文件</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            之前导出的 .json 完整备份
          </ThemedText>
        </View>
        {isReading ? <ActivityIndicator color={theme.textSecondary} /> : null}
      </Pressable>

      <Pressable
        onPress={onPickCloud}
        disabled={isReading || !summary || summary.transactions === 0}
        style={[
          styles.row,
          { backgroundColor: theme.backgroundElement },
          (!summary || summary.transactions === 0) && styles.disabled,
        ]}>
        <Ionicons name="cloud-download-outline" size={20} color={theme.cardHighlight} />
        <View style={styles.rowText}>
          <ThemedText type="default">从云端恢复</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {summary
              ? summary.transactions > 0
                ? `${summary.transactions} 笔账单 · ${summary.categories} 个分类`
                : '云端还没有数据'
              : '正在查云端…'}
          </ThemedText>
        </View>
      </Pressable>
    </View>
  );
}

function Preview({ fileName, plan }: { fileName: string | null; plan: ImportPlan }) {
  const theme = useTheme();
  const created = plan.categories.filter((item) => item.action === 'create').length;
  const matched = plan.categories.filter((item) => item.action === 'matched').length;

  return (
    <View style={styles.stack}>
      <View style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
        <Ionicons name="document-text-outline" size={20} color={theme.cardHighlight} />
        <View style={styles.rowText}>
          <ThemedText type="default" numberOfLines={1}>
            {fileName ?? '备份文件'}
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
      {plan.adoptWholesale ? (
        <ThemedText type="small" themeColor="textSecondary">
          这台手机还没有账单，会直接采用备份里的分类，包括你改过的名字和停用状态。
        </ThemedText>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          这台手机已经有账了，本地现有的分类保持原样；备份里多出来的才会新建。
        </ThemedText>
      )}
    </View>
  );
}

function Done({ result }: { result: ImportResult }) {
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
  screen: { flex: 1 },
  content: { paddingHorizontal: ScreenPadding, paddingVertical: Spacing.four, gap: Spacing.three },
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
  disabled: { opacity: 0.45 },
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
  footer: { paddingHorizontal: ScreenPadding, paddingBottom: Spacing.three },
  primary: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
