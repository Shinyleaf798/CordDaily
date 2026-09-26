import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ModalHost } from '@/components/ui/modal-host';
import { ModalSheet, useSheetTransition } from '@/components/ui/modal-sheet';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import type { BackupRange } from '@/db/backup';
import type { ExportFormat } from '@/db/backup-file';
import { describeError } from '@/db/sync';
import { useExportToFile, usePushToCloud } from '@/hooks/use-backup';
import { useTheme } from '@/hooks/use-theme';

type BackupSheetProps = {
  unsynced: number;
  transactions: number;
  /** 从「账单导入导出」那一行进来时直接落到文件那步——那一行说的就是文件，再问一次"去哪儿"是多余的 */
  initialStep?: 'destination' | 'file';
  onDismiss: () => void;
};

type RangeKey = 'all' | 'month' | 'year';

const RANGE_LABELS: Record<RangeKey, string> = { all: '全部', month: '本月', year: '今年' };

/**
 * 备份弹层。两步在**同一层**里换内容，不是两个 Modal：
 * 原生 Modal 套 Modal 在 iOS 上会有里层关掉、外层闪一下的毛病
 * （交易详情那层确认删除时踩过，解法一样）。
 *
 * 第一步问「去哪儿」而不是「什么格式」：云端只有一种格式，格式只是文件那条路的事。
 * 云端那条**点下去就执行**，范围永远是"全部还没备份的"，所以它不往下钻一层。
 *
 * 为什么是弹层不是路由：选完就地执行，没有自己的地址，也不该出现在返回栈里
 * （见 modal-host.tsx 上那条判断标准）。
 */
export function BackupSheet({ unsynced, transactions, initialStep = 'destination', onDismiss }: BackupSheetProps) {
  const theme = useTheme();
  const sheet = useSheetTransition(onDismiss, 0.7);
  const [step, setStep] = useState<'destination' | 'file'>(initialStep);
  const [format, setFormat] = useState<ExportFormat>('json');
  const [range, setRange] = useState<RangeKey>('all');
  const [error, setError] = useState<string | null>(null);

  const exportToFile = useExportToFile();
  const pushToCloud = usePushToCloud();

  const handlePushToCloud = () => {
    setError(null);
    pushToCloud.mutate(undefined, {
      onSuccess: () => sheet.close(),
      // 没网、凭证过期、服务器在睡都会走到这里。就地显示，用户正看着这一层
      onError: (pushError) => setError(describeError(pushError)),
    });
  };

  const handleExport = () => {
    setError(null);
    exportToFile.mutate(
      { format, range: toRange(range) },
      {
        onSuccess: () => sheet.close(),
        // 分享面板弹不出来、磁盘写不进去都会走到这里。就地显示，不要 Alert——
        // 用户正看着这个弹层，把错误摆在他眼前那一层最省事
        onError: (mutationError) => setError((mutationError as Error).message),
      },
    );
  };

  return (
    <ModalHost visible animation="none" onRequestClose={() => sheet.close()}>
      <ModalSheet title={step === 'destination' ? '备份' : '导出成文件'} transition={sheet}>
        {step === 'destination' ? (
          <View style={styles.body}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
              这台手机上有 {transactions} 笔账单，其中 {unsynced} 笔从没备份过。
            </ThemedText>

            {/* 云端这条**点下去就执行**，不往下钻一层：它只有一种格式（完整），
                范围永远是"全部还没备份的"，没有可选的东西 */}
            <Pressable
              onPress={handlePushToCloud}
              disabled={pushToCloud.isPending || unsynced === 0}
              style={[
                styles.row,
                { backgroundColor: theme.background },
                unsynced === 0 && styles.disabled,
              ]}>
              <Ionicons name="cloud-upload-outline" size={20} color={theme.cardHighlight} />
              <View style={styles.rowText}>
                <ThemedText type="default">备份到云端</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {unsynced === 0 ? '没有需要上传的记录' : `推 ${unsynced} 笔新的上去 · 需要联网`}
                </ThemedText>
              </View>
              {pushToCloud.isPending ? <ActivityIndicator color={theme.textSecondary} /> : null}
            </Pressable>

            <Pressable
              onPress={() => setStep('file')}
              style={[styles.row, { backgroundColor: theme.background }]}>
              <Ionicons name="download-outline" size={20} color={theme.cardHighlight} />
              <View style={styles.rowText}>
                <ThemedText type="default">导出成文件</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  自己留一份 .json 或 .csv
                </ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
            </Pressable>

            {error ? (
              <ThemedText type="small" style={{ color: theme.expense }}>
                {error}
              </ThemedText>
            ) : null}

            <ThemedText type="small" themeColor="textSecondary">
              账只在这台手机上，点了才会走出去。
            </ThemedText>
          </View>
        ) : (
          <View style={styles.body}>
            <View style={[styles.segment, { backgroundColor: theme.tabTrackBackground }]}>
              {(['json', 'csv'] as const).map((option) => (
                <Pressable
                  key={option}
                  onPress={() => setFormat(option)}
                  style={[
                    styles.segmentItem,
                    format === option && { backgroundColor: theme.background },
                  ]}>
                  <ThemedText type="small" themeColor={format === option ? 'text' : 'textSecondary'}>
                    {option === 'json' ? '完整备份 .json' : '表格 .csv'}
                  </ThemedText>
                </Pressable>
              ))}
            </View>

            {(Object.keys(RANGE_LABELS) as RangeKey[]).map((key) => (
              <Pressable
                key={key}
                onPress={() => setRange(key)}
                style={[styles.row, { backgroundColor: theme.background }]}>
                <View
                  style={[
                    styles.radio,
                    { borderColor: range === key ? theme.cardHighlight : theme.backgroundSelected },
                    range === key && { backgroundColor: theme.cardHighlight },
                  ]}
                />
                <ThemedText type="default" style={styles.grow}>
                  {RANGE_LABELS[key]}
                </ThemedText>
              </Pressable>
            ))}

            {/* 这段说明跟着格式换，因为两种格式能不能原样导回来是完全不同的答案 */}
            <ThemedText type="small" themeColor="textSecondary">
              {format === 'json'
                ? '包含分类、账户、转账、周期规则、月预算和图片链接。内置分类 id 是固定的，导回来直接对上。'
                : '分类写成名字（餐饮 / 晚餐），不带 id。这个文件给 Excel 看，导回来需要手工对照分类。'}
            </ThemedText>

            {error ? (
              <ThemedText type="small" style={{ color: theme.expense }}>
                {error}
              </ThemedText>
            ) : null}

            <Pressable
              onPress={handleExport}
              disabled={exportToFile.isPending}
              style={[styles.primary, { backgroundColor: theme.cardHighlight }]}>
              {exportToFile.isPending ? (
                <ActivityIndicator color={theme.onCardHighlight} />
              ) : (
                <ThemedText type="default" style={{ color: theme.onCardHighlight }}>
                  导出并分享
                </ThemedText>
              )}
            </Pressable>
          </View>
        )}
      </ModalSheet>
    </ModalHost>
  );
}

// 「本月」「今年」都是左闭右开：to 取下一个周期的第一天，免得纠结月末是 30 还是 31
function toRange(key: RangeKey): BackupRange {
  const now = new Date();
  if (key === 'month') {
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
      to: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString(),
    };
  }
  if (key === 'year') {
    return {
      from: new Date(now.getFullYear(), 0, 1).toISOString(),
      to: new Date(now.getFullYear() + 1, 0, 1).toISOString(),
    };
  }
  return {};
}

const styles = StyleSheet.create({
  body: { gap: Spacing.two, paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  center: { textAlign: 'center' },
  grow: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: 12,
  },
  rowText: { flex: 1, gap: 2 },
  disabled: { opacity: 0.45 },
  radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  segment: { flexDirection: 'row', borderRadius: 10, padding: 3, gap: 3 },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: Spacing.two, borderRadius: 8 },
  primary: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.one,
  },
});
