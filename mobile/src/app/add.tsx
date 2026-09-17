import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { TransactionForm } from '@/components/add-transaction/transaction-form';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { Spacing } from '@/constants/theme';
import { useTransaction } from '@/hooks/use-transactions';
import { useTheme } from '@/hooks/use-theme';

/**
 * 记一笔（`/add`）和改一笔（`/add?id=xxx`）是同一个页面。
 *
 * 这一层只干一件事：**把要编辑的那笔查出来，查到了再挂载表单**。
 * 表单里十几个字段的初始值因此可以直接从 props 读，不用 useEffect 往 state 里同步——
 * 那个写法会先渲染一轮空表单再跳成有值的，编辑时肉眼能看见闪一下。
 */
export default function AddScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { data: existing, isPending, isError } = useTransaction(id);

  if (id && isPending) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator color={theme.cardHighlight} />
      </ThemedView>
    );
  }

  // 查不到多半是它刚被删掉（详情弹层里删完又从别处进来）。不空着一张表单装作没事，
  // 那样保存下去会变成一笔莫名其妙的新账
  if (id && (isError || !existing)) {
    return (
      <ThemedView style={styles.center}>
        <View style={styles.message}>
          <ThemedText type="default">这笔交易已经不在了</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            可能刚刚被删掉了。返回上一页再看看。
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  // key 让"从编辑切到新建"这类场景重新挂载表单，而不是把上一笔的值留在输入框里
  return <TransactionForm key={existing?.id ?? 'new'} initial={existing ?? null} />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    alignItems: 'center',
    gap: Spacing.one,
    padding: Spacing.four,
  },
});
