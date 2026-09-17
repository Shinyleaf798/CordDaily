import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
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

// 收入/支出的分段切换。从 add-transaction/ 挪到 transaction/ 是因为分类管理页也要用同一个控件：
// 留在记账页的目录里，就会逼着分类管理页从 add-transaction 里 import 一个跟记账无关的东西
export function TransactionTypeTabs({ value, onChange }: TransactionTypeTabsProps) {
  const theme = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.tabTrackBackground }]}>
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
