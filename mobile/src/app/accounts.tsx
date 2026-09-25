import { router } from 'expo-router';
import { Stack } from 'expo-router/js-stack';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccountRow } from '@/components/account/account-row';
import { ThemedText } from '@/components/ui/themed-text';
import { ScreenPadding, Spacing } from '@/constants/theme';
import { useAccounts } from '@/hooks/use-accounts';
import { useTheme } from '@/hooks/use-theme';

/**
 * 账户管理：一个平铺的列表，点一行改它，右上角加一个。
 *
 * 这一页原来是底部的「资产」tab，现在降级成 我的 → 账本 底下的一个二级页，
 * 跟分类管理、标签汇总做邻居——它们是同一类东西：给交易贴标签的字典表。
 *
 * 降级的理由是账户在这个 App 里只有一个职责：让一笔账能记下"我用什么付的"（现金、TNG、某张卡）。
 * 余额准不准无关紧要，所以也就不需要转账、不需要对账，整页没有任何非它不可的内容，
 * 撑不起五个 tab 里的一个。空出来的位置给了统计页（见 DECISIONS.md）。
 *
 * 不分组、不汇总、不排序——多一层结构都是空转。
 */
export default function AccountsScreen() {
  const theme = useTheme();
  const { data: accounts, isLoading } = useAccounts();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: true, headerTitle: '账户' }} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
            记一笔账时用来选「我用什么付的」
          </ThemedText>
          <Pressable onPress={() => router.push('/account-editor')} hitSlop={8}>
            <ThemedText type="linkPrimary">+ 新建</ThemedText>
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
    paddingHorizontal: ScreenPadding,
    paddingTop: 12,
    paddingBottom: Spacing.six,
    gap: Spacing.two,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    marginBottom: Spacing.one,
  },
  hint: {
    flex: 1,
  },
  loading: {
    marginTop: Spacing.four,
  },
});
