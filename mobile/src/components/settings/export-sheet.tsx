import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ModalHost } from '@/components/ui/modal-host';
import { ModalSheet, useSheetTransition } from '@/components/ui/modal-sheet';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import type { BackupRange } from '@/db/backup';
import type { ExportFormat } from '@/db/backup-file';
import { useExportToFile } from '@/hooks/use-backup';
import { useTheme } from '@/hooks/use-theme';

type ExportSheetProps = {
  onDismiss: () => void;
};

type RangeKey = 'all' | 'month' | 'year';

const RANGE_LABELS: Record<RangeKey, string> = { all: '全部', month: '本月', year: '今年' };

/**
 * 导出成文件。**跟「备份到云端」是两个入口**：原来它们挤在一个弹层里，
 * 每次备份都要先回答一道"去云端还是导成文件"的选择题，而那道题的答案几乎永远是云端。
 *
 * 格式放在最上面，因为它决定下面那段说明写什么——两种格式能不能原样导回来，
 * 是完全不同的答案。
 */
export function ExportSheet({ onDismiss }: ExportSheetProps) {
  const theme = useTheme();
  const sheet = useSheetTransition(onDismiss, 0.7);
  const [format, setFormat] = useState<ExportFormat>('json');
  const [range, setRange] = useState<RangeKey>('all');
  const [error, setError] = useState<string | null>(null);

  const exportToFile = useExportToFile();

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
      <ModalSheet title="导出成文件" transition={sheet}>
        <View style={styles.body}>
          <View style={[styles.segment, { backgroundColor: theme.tabTrackBackground }]}>
            {(['json', 'csv'] as const).map((option) => (
              <Pressable
                key={option}
                onPress={() => setFormat(option)}
                style={[styles.segmentItem, format === option && { backgroundColor: theme.background }]}>
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
              // 按下去出现的是系统分享面板（expo-sharing），不是"已保存到某处"
              <ThemedText type="default" style={{ color: theme.onCardHighlight }}>
                导出并分享
              </ThemedText>
            )}
          </Pressable>
        </View>
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
  grow: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: 12,
  },
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
