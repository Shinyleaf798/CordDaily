import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccountRow } from '@/components/assets/account-row';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useAccountBalances } from '@/hooks/use-accounts';
import { useTheme } from '@/hooks/use-theme';

/**
 * 资产页：一个平铺的账户列表，点一行改它，右上角加一个。
 *
 * 不分组、不汇总、不排序——账户在这个 App 里只有一个职责：
 * 让一笔账能记下"我用什么付的"（现金、TNG、某张卡）。
 * 这一页存在的意义仅仅是"把那几个名字管起来"，多一层结构都是空转。
 *
 * 数据只有一个来源（useAccountBalances），所以也没有单独的 view-data hook：
 * 派生层是用来统一多个查询的口径的，只有一个查询时它只是多一跳。
 */
export default function AssetsScreen() {
  const theme = useTheme();
  const { data: accounts, isLoading } = useAccountBalances();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <ThemedText type="pageTitle">资产</ThemedText>
          <Pressable onPress={() => router.push('/account-editor')} hitSlop={8}>
            <ThemedText type="linkPrimary">+ 新建账户</ThemedText>
          </Pressable>
        </View>

        {isLoading ? (
          <ActivityIndicator color={theme.cardHighlight} style={styles.loading} />
        ) : (
          (accounts ?? []).map((account) => (
            <AccountRow
              key={account.id}
              account={account}
              onPress={() => router.push({ pathname: '/account-editor', params: { id: account.id } })}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.three,
    paddingTop: 12,
    paddingBottom: Spacing.six,
    gap: Spacing.two,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.one,
  },
  loading: {
    marginTop: Spacing.four,
  },
});
