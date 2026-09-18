import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router/js-stack';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { Spacing } from '@/constants/theme';
import { usePendingReimbursementTotal, useReimbursements, useSetReimbursed } from '@/hooks/use-transactions';
import { useTheme } from '@/hooks/use-theme';
import { formatMonthDay } from '@/utils/date';

// 报销清单。这一页存在的理由就是顶上那个数字——"我现在垫了多少钱还没收回来"。
// 只有 isReimbursable 一个布尔值是撑不起这页的：标记打上就再也清不掉，列表会越积越长，
// 所以 schema 里配了 reimbursedAt（null=待收回，有值=已收回）。
export default function ReimbursementsScreen() {
  const theme = useTheme();
  const [showSettled, setShowSettled] = useState(false);
  const { data: pendingTotal } = usePendingReimbursementTotal();
  const { data: items } = useReimbursements(showSettled);
  const setReimbursed = useSetReimbursed();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: true, headerTitle: '报销' }} />

      <ScrollView contentContainerStyle={styles.content}>
        <ThemedView type="backgroundElement" style={styles.totalCard}>
          <ThemedText type="small" themeColor="textSecondary">
            待收回
          </ThemedText>
          <ThemedText type="subtitle" style={{ color: theme.cardHighlight }}>
            RM{(pendingTotal ?? 0).toFixed(2)}
          </ThemedText>
        </ThemedView>

        <View style={styles.tabRow}>
          {[
            { key: false, label: '待报销' },
            { key: true, label: '已收回' },
          ].map((tab) => (
            <Pressable
              key={String(tab.key)}
              onPress={() => setShowSettled(tab.key)}
              style={[
                styles.tab,
                { backgroundColor: showSettled === tab.key ? theme.cardHighlight : theme.backgroundElement },
              ]}>
              <ThemedText
                type="smallBold"
                style={showSettled === tab.key ? { color: theme.onCardHighlight } : undefined}
                themeColor={showSettled === tab.key ? undefined : 'textSecondary'}>
                {tab.label}
              </ThemedText>
            </Pressable>
          ))}
        </View>

        {!items || items.length === 0 ? (
          <ThemedText type="default" themeColor="textSecondary">
            {showSettled ? '还没有已收回的记录。' : '没有待收回的垫付。记账时点「报销」标记你先垫的钱，就会出现在这里。'}
          </ThemedText>
        ) : (
          <ThemedView type="backgroundElement" style={styles.listCard}>
            {items.map((item, index) => (
              <View
                key={item.id}
                style={[
                  styles.row,
                  index < items.length - 1 && {
                    borderBottomColor: theme.backgroundSelected,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                  },
                ]}>
                <ThemedText style={styles.icon}>{item.categoryIcon ?? '📦'}</ThemedText>

                <View style={styles.middle}>
                  <ThemedText type="default">{item.title}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {item.categoryName ?? '未分类'} · {formatMonthDay(new Date(item.date))}
                    {item.merchant ? ` · ${item.merchant}` : ''}
                  </ThemedText>
                </View>

                <View style={styles.right}>
                  <ThemedText type="smallBold">RM{item.amount.toFixed(2)}</ThemedText>
                  <Pressable
                    onPress={() => setReimbursed.mutate({ id: item.id, reimbursed: !showSettled })}
                    disabled={setReimbursed.isPending}
                    hitSlop={8}
                    style={styles.actionButton}>
                    <Ionicons
                      name={showSettled ? 'arrow-undo-outline' : 'checkmark-circle-outline'}
                      size={22}
                      color={showSettled ? theme.textSecondary : theme.income}
                    />
                  </Pressable>
                </View>
              </View>
            ))}
          </ThemedView>
        )}

        <ThemedText type="small" themeColor="textSecondary">
          标记为已收回只是结掉这条待办，不会自动记一笔收入——垫付的钱本来就没算进消费统计（记账时勾报销会同时打开「不计入统计」），
          再记收入反而会让当月收入虚高。
        </ThemedText>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.two,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  totalCard: {
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  tabRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  tab: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listCard: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
  },
  icon: {
    fontSize: 20,
  },
  middle: {
    flex: 1,
    gap: 2,
  },
  right: {
    alignItems: 'flex-end',
    gap: Spacing.one,
  },
  actionButton: {
    padding: 2,
  },
});
