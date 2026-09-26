import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * 「我的」页分组列表的两个零件：一个组（小标题 + 若干行）和一行。
 *
 * 做成组件而不是在页面里写四遍同样的 `<Pressable style={row}>`：这一页现在有两组，
 * 以后大概率还会长。四份拷贝里改漏一份，视觉上就会有一行的圆角或内距跟别人不一样。
 */

export function SettingsSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
        {label}
      </ThemedText>
      <View style={styles.rows}>{children}</View>
    </View>
  );
}

type SettingsRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint?: string;
  /** 右边那个当前值（「每 7 天」「黑金」）。它是这一行最有用的部分——不用点进去就知道现在是什么 */
  value?: string;
  href?: Href;
  onPress?: () => void;
  danger?: boolean;
};

export function SettingsRow({ icon, label, hint, value, href, onPress, danger }: SettingsRowProps) {
  const theme = useTheme();
  const color = danger ? theme.expense : theme.cardHighlight;

  return (
    <Pressable
      onPress={() => (onPress ? onPress() : href ? router.push(href) : undefined)}
      style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
      <Ionicons name={icon} size={20} color={color} />
      <View style={styles.rowText}>
        <ThemedText type="default" style={danger ? { color: theme.expense } : undefined}>
          {label}
        </ThemedText>
        {hint ? (
          <ThemedText type="small" themeColor="textSecondary">
            {hint}
          </ThemedText>
        ) : null}
      </View>
      {value ? (
        <ThemedText type="small" themeColor="textSecondary">
          {value}
        </ThemedText>
      ) : null}
      <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
  sectionLabel: { paddingHorizontal: Spacing.half },
  rows: { gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: 12,
  },
  rowText: { flex: 1, gap: 2 },
});
