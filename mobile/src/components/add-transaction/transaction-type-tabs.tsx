import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TransactionTypeTab = 'EXPENSE' | 'INCOME';

const TABS: { key: TransactionTypeTab; label: string }[] = [
  { key: 'EXPENSE', label: '支出' },
  { key: 'INCOME', label: '收入' },
];

type TransactionTypeTabsProps = {
  value: TransactionTypeTab;
  onChange: (value: TransactionTypeTab) => void;
};

export function TransactionTypeTabs({ value, onChange }: TransactionTypeTabsProps) {
  const theme = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundElement }]}>
      {TABS.map((tab) => {
        const isActive = tab.key === value;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={[styles.tab, isActive && { backgroundColor: theme.background }]}>
            <ThemedText type="smallBold" themeColor={isActive ? 'text' : 'textSecondary'}>
              {tab.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignSelf: 'center',
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  tab: {
    width: 64,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
