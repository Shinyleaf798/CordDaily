import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ModalHost } from '@/components/ui/modal-host';
import { ModalSheet, useSheetTransition } from '@/components/ui/modal-sheet';
import { ThemedText } from '@/components/ui/themed-text';
import { FontHints, FontLabels, FontNames, fontStyleFor } from '@/constants/font';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useFontStore } from '@/store/font.store';

/**
 * 「我的 → 字体」弹层。顶上一块首页样本当预览，底下三选一。
 *
 * 选了立刻生效、弹层不关（跟首页样式弹层同一个规矩）：预览和弹层后面露出来的「我的」页一起变，
 * 不满意马上点回去。
 *
 * 每个选项右边那串样本数字**用 RN 的 Text 而不是 ThemedText**：ThemedText 会套上用户当前选的字体，
 * 三行就都长一样了；这里要的恰恰是每行用它自己那套
 */
export function FontSheet({ onDismiss }: { onDismiss: () => void }) {
  const theme = useTheme();
  const sheet = useSheetTransition(onDismiss, 0.7);
  const fontName = useFontStore((s) => s.fontName);
  const setFontName = useFontStore((s) => s.setFontName);

  return (
    <ModalHost visible animation="none" onRequestClose={() => sheet.close()}>
      <ModalSheet title="字体" transition={sheet}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.preview, { backgroundColor: theme.background }]}>
            <ThemedText type="small" themeColor="textSecondary">
              本月支出
            </ThemedText>
            <View style={styles.previewAmount}>
              <ThemedText type="small" themeColor="textSecondary">
                RM
              </ThemedText>
              <ThemedText style={[styles.previewNumber, { color: theme.cardHighlight }]}>2,847.60</ThemedText>
            </View>
            <View style={styles.previewRow}>
              <ThemedText type="small">午餐 · McDonald&apos;s</ThemedText>
              <ThemedText type="small" style={styles.tabular}>
                -18.90
              </ThemedText>
            </View>
            <View style={styles.previewRow}>
              <ThemedText type="small" themeColor="textSecondary">
                话费 · 10月23日
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.tabular}>
                -30.00
              </ThemedText>
            </View>
          </View>

          <ThemedText type="small" themeColor="textSecondary">
            数字和英文
          </ThemedText>
          <View>
            {FontNames.map((option, index) => {
              const selected = option === fontName;
              return (
                <Pressable
                  key={option}
                  onPress={() => setFontName(option)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  style={[
                    styles.option,
                    index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.divider },
                  ]}>
                  <View style={styles.grow}>
                    <ThemedText>{FontLabels[option]}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {FontHints[option]}
                    </ThemedText>
                  </View>
                  <Text
                    style={[
                      styles.sample,
                      { color: selected ? theme.cardHighlight : theme.text, fontWeight: '700' },
                      fontStyleFor(option, '700'),
                    ]}>
                    1,234.50
                  </Text>
                  <View
                    style={[
                      styles.radio,
                      selected
                        ? { borderWidth: 6, borderColor: theme.cardHighlight }
                        : { borderWidth: 1.5, borderColor: theme.backgroundSelected },
                    ]}
                  />
                </Pressable>
              );
            })}
          </View>

          <ThemedText type="small" themeColor="textSecondary" style={styles.footnote}>
            全 App 一起换。中文固定用系统黑体。
          </ThemedText>
        </ScrollView>
      </ModalSheet>
    </ModalHost>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: Spacing.four,
    gap: Spacing.two,
  },
  preview: {
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    paddingVertical: 14,
    marginBottom: Spacing.two,
  },
  previewAmount: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: Spacing.two,
  },
  previewNumber: {
    fontSize: 36,
    lineHeight: 42,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
  },
  grow: {
    flex: 1,
  },
  sample: {
    fontSize: 18,
    fontVariant: ['tabular-nums'],
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  footnote: {
    marginTop: Spacing.two,
  },
});
