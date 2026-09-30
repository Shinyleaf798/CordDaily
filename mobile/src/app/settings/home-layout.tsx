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
import { ScreenPadding, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useHomeLayoutStore } from '@/store/home-layout.store';

/**
 * 首页布局。跟主题是两个独立设置：布局管结构、主题管配色，可以任意组合，所以分成两页。
 *
 * 这一页现在是**两组单选**，不是一组：上半和下半各挑一种画法，四种组合都成立。
 * 分成两组而不是把四种组合平铺成四个选项——那样是把一个"两个正交选择"的问题
 * 硬拍成一维，以后任一边多一种画法，选项数就翻倍。
 */
export default function HomeLayoutSettingsScreen() {
  const theme = useTheme();
  const top = useHomeLayoutStore((s) => s.top);
  const bills = useHomeLayoutStore((s) => s.bills);
  const setSlot = useHomeLayoutStore((s) => s.setSlot);
  const current = { top, bills };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['bottom', 'left', 'right']}>
      <ThemedView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
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
