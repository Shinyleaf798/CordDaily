import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Stack } from 'expo-router/js-stack';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryIcon } from '@/components/category/category-icon';
import { ThemedText } from '@/components/ui/themed-text';
import { ScreenPadding, Spacing } from '@/constants/theme';
import { describeRule, type RecurringRule } from '@/db/recurring';
import { useDeleteRecurringRule, useRecurringRules, useSetRecurringActive } from '@/hooks/use-recurring';
import { useTheme } from '@/hooks/use-theme';
import { formatDayLabel } from '@/utils/date';
import { formatCategoryPath, formatSignedMoney } from '@/utils/format';

/**
 * 周期记账（我的 → 周期记账）：列出所有规则，每条能暂停/继续、能删。
 *
 * **这一页不负责新建**。新建在记账页上点「重复」——一条规则的全部字段（金额、币种、分类、账户、日期）
 * 记账页本来就有一整套输入，在这里再造一份表单只会多一套要同步维护的东西，
 * 而用户想到"每月都要记"的那一刻，手上正好在记这一笔。
 *
 * 点一行进编辑页，每个字段都能改（见 app/recurring-editor.tsx），只影响以后生成的那几笔。
 */
export default function RecurringScreen() {
  const theme = useTheme();
  const { data: rules, isLoading } = useRecurringRules();
  const setActive = useSetRecurringActive();
  const remove = useDeleteRecurringRule();

  const confirmDelete = (rule: RecurringRule) => {
    Alert.alert(
      `删除「${rule.title}」？`,
      '以后不再自动记这一笔。已经记上的账一笔都不动。',
      [
        { text: '取消', style: 'cancel' },
        { text: '删除', style: 'destructive', onPress: () => remove.mutate(rule.id) },
      ],
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: true, headerTitle: '周期记账' }} />

      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="small" themeColor="textSecondary">
          记一笔时点「重复」就会出现在这里。到日子打开 App，会自动补记上。点一条可以修改。
        </ThemedText>

        {isLoading ? (
          <ActivityIndicator color={theme.cardHighlight} style={styles.loading} />
        ) : (rules ?? []).length === 0 ? (
          <View style={[styles.empty, { backgroundColor: theme.backgroundElement }]}>
            <Ionicons name="repeat-outline" size={28} color={theme.textSecondary} />
            <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
              还没有周期记账。比如每月的订阅费：记账页填好那一笔，点「重复」选每月再保存。
            </ThemedText>
          </View>
        ) : (
          (rules ?? []).map((rule) => (
            <Pressable
              key={rule.id}
              onPress={() => router.push({ pathname: '/recurring-editor', params: { id: rule.id } })}
              style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
              <View style={[styles.iconWrap, { backgroundColor: theme.background }]}>
                <CategoryIcon icon={rule.categoryIcon} size={20} />
              </View>

              <View style={styles.rowText}>
                <ThemedText type="default" numberOfLines={1}>
                  {rule.title}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {describeRule(rule)} ·{' '}
                  {rule.isActive ? `下次 ${formatDayLabel(new Date(rule.nextRunDate))}` : '已暂停'} ·{' '}
                  {formatCategoryPath(rule.categoryParentName, rule.categoryName)}
                </ThemedText>
              </View>

              <ThemedText
                type="default"
                style={{ color: rule.type === 'INCOME' ? theme.income : theme.text, opacity: rule.isActive ? 1 : 0.5 }}>
                {formatSignedMoney(rule.amount, rule.currency, rule.type)}
              </ThemedText>

              <Switch
                value={rule.isActive}
                onValueChange={(active) => setActive.mutate({ id: rule.id, active })}
                trackColor={{ true: theme.cardHighlight }}
              />

              <Pressable onPress={() => confirmDelete(rule)} hitSlop={8}>
                <Ionicons name="trash-outline" size={18} color={theme.textSecondary} />
              </Pressable>
            </Pressable>
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
  loading: {
    marginTop: Spacing.four,
  },
  empty: {
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
    borderRadius: 14,
    marginTop: Spacing.two,
  },
  emptyText: {
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 14,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
});
