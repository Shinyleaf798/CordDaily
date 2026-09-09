import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccountRow } from '@/components/account-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { AccountType } from '@/db/accounts';
import { useAccounts, useCreateAccount } from '@/hooks/use-accounts';
import { useTheme } from '@/hooks/use-theme';

const ACCOUNT_TYPES: AccountType[] = ['CASH', 'BANK', 'EWALLET', 'CREDIT_CARD', 'OTHER'];

export default function AssetsScreen() {
  const theme = useTheme();
  const { data: accounts, isLoading } = useAccounts();
  const createAccount = useCreateAccount();

  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('CASH');
  const [openingBalance, setOpeningBalance] = useState('');

  const resetForm = () => {
    setName('');
    setType('CASH');
    setOpeningBalance('');
    setIsAdding(false);
  };

  const handleCreate = () => {
    if (!name.trim()) return;
    createAccount.mutate(
      { name: name.trim(), type, openingBalance: Number(openingBalance) || 0 },
      { onSuccess: resetForm },
    );
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <ThemedText type="title">资产</ThemedText>
          <Pressable onPress={() => setIsAdding((v) => !v)}>
            <ThemedText type="linkPrimary">{isAdding ? '取消' : '+ 新建账户'}</ThemedText>
          </Pressable>
        </View>

        {isAdding && (
          <ThemedView type="backgroundElement" style={styles.form}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="账户名称"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text }]}
            />
            <View style={styles.typeRow}>
              {ACCOUNT_TYPES.map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setType(t)}
                  style={[styles.chip, { backgroundColor: t === type ? theme.backgroundSelected : theme.background }]}>
                  <ThemedText type="small">{t}</ThemedText>
                </Pressable>
              ))}
            </View>
            <TextInput
              value={openingBalance}
              onChangeText={setOpeningBalance}
              placeholder="期初余额（可选，默认0）"
              placeholderTextColor={theme.textSecondary}
              keyboardType="numeric"
              style={[styles.input, { color: theme.text }]}
            />
            <Pressable onPress={handleCreate} disabled={!name.trim()} style={styles.saveButton}>
              <ThemedText style={{ color: '#ffffff', fontWeight: '600' }}>保存</ThemedText>
            </Pressable>
          </ThemedView>
        )}

        <FlatList
          data={accounts ?? []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <AccountRow account={item} />}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.two }} />}
          contentContainerStyle={{ paddingTop: Spacing.three, paddingBottom: Spacing.six }}
          ListEmptyComponent={
            !isLoading ? (
              <ThemedText type="default" themeColor="textSecondary">
                还没有账户，点右上角新建一个吧。
              </ThemedText>
            ) : null
          }
        />
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.four,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  form: {
    marginTop: Spacing.three,
    padding: Spacing.three,
    borderRadius: 12,
    gap: Spacing.two,
  },
  input: {
    height: 44,
    borderRadius: 10,
    paddingHorizontal: Spacing.two,
    fontSize: 16,
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#80808040',
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  chip: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 8,
  },
  saveButton: {
    height: 44,
    borderRadius: 10,
    backgroundColor: '#3c87f7',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
