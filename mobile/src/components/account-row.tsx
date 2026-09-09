import { StyleSheet, View } from 'react-native';

import { useAccountBalance } from '@/hooks/use-accounts';
import { Spacing } from '@/constants/theme';
import type { Account } from '@/db/accounts';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

export function AccountRow({ account }: { account: Account }) {
  const { data: balance } = useAccountBalance(account.id);

  return (
    <ThemedView type="backgroundElement" style={styles.row}>
      <View>
        <ThemedText type="default">{account.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {account.type}
        </ThemedText>
      </View>
      <ThemedText type="smallBold">
        {(balance ?? account.openingBalance).toFixed(2)} {account.currency}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: 12,
  },
});
