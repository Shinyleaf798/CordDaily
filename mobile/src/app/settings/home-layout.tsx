import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import {
  HomeLayoutNames,
  HomeLayoutLabels,
  HomeSlotHints,
  HomeSlotLabels,
  HomeSlots,
} from '@/constants/home-layout';
import { HomeRangeLabels, HomeRanges } from '@/constants/home-range';
import { ScreenPadding, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useHomeStore } from '@/store/home.store';

/**
 * 首页设置。跟主题是两个独立的页：这里管结构，主题管配色，可以任意组合。
 *
 * 三组选择，两种形状：
 *
 * - **上半 / 下半各用哪种画法**——整行的单选，因为每一种都要带一句说明
 *   （「金环」在上半是表盘、在下半是通栏列表，光看名字猜不出来）。
 *   分成两组而不是把四种组合平铺成四个选项：后者是把两个正交的选择硬拍成一维，
 *   任一边多一种画法，选项数就翻倍。
 * - **账单看多长一段**——一排小格子。这六档不需要解释（「30天」就是 30 天），
 *   摆成六个整行只会把这一页拖得很长，而且掩盖了"它们是同一把尺子上的刻度"。
 */
export default function HomeLayoutSettingsScreen() {
  const theme = useTheme();
  const top = useHomeStore((s) => s.top);
  const bills = useHomeStore((s) => s.bills);
  const range = useHomeStore((s) => s.range);
  const setSlot = useHomeStore((s) => s.setSlot);
  const setRange = useHomeStore((s) => s.setRange);
  const current = { top, bills };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['bottom', 'left', 'right']}>
      <ThemedView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.group}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.groupTitle}>
              账单看多长一段
            </ThemedText>

            <View style={styles.chipRow}>
              {HomeRanges.map((name) => {
                const selected = name === range;
                return (
                  <Pressable
                    key={name}
                    onPress={() => setRange(name)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: selected ? theme.cardHighlight : theme.backgroundElement,
                      },
                    ]}>
                    <ThemedText
                      type="small"
                      style={selected ? { color: theme.onCardHighlight, fontWeight: '600' } : undefined}>
                      {HomeRangeLabels[name]}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>

            <ThemedText type="small" themeColor="textSecondary" style={styles.groupTitle}>
              「全部」会把整本账一次性列出来，账多了首页会变慢
            </ThemedText>
          </View>

          {HomeSlots.map((slot) => (
            <View key={slot} style={styles.group}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.groupTitle}>
                {HomeSlotLabels[slot]}
              </ThemedText>

              {HomeLayoutNames.map((name) => (
                <Pressable
                  key={name}
                  onPress={() => setSlot(slot, name)}
                  style={[
                    styles.row,
                    {
                      backgroundColor: theme.backgroundElement,
                      borderColor: name === current[slot] ? theme.cardHighlight : 'transparent',
                    },
                  ]}>
                  <View style={styles.rowText}>
                    <ThemedText type="default">{HomeLayoutLabels[name]}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {HomeSlotHints[slot][name]}
                    </ThemedText>
                  </View>
                  {name === current[slot] ? (
                    <Ionicons name="checkmark-circle" size={20} color={theme.cardHighlight} />
                  ) : null}
                </Pressable>
              ))}
            </View>
          ))}
        </ScrollView>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: ScreenPadding, paddingVertical: Spacing.four, gap: Spacing.four },
  group: { gap: Spacing.two },
  groupTitle: { paddingHorizontal: Spacing.one },
  // 换行而不是横向滚：六个格子在窄屏上排两行还看得全，横滚会让第五第六档藏起来
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  // 选中态用实心强调色（不是描边）：这一排跟底下那两组是两种东西，
  // 形状不一样才不会被读成"同一组里的更多选项"
  chip: {
    minWidth: 64,
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: 'center',
  },
  // 选中态用描边表示，跟主题页保持一致
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: 12,
    borderWidth: 2,
  },
  rowText: { flex: 1, gap: 2 },
});
