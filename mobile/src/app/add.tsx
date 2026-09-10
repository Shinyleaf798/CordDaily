import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AmountKeypad } from '@/components/add-transaction/amount-keypad';
import { CategoryGrid, type CategoryGridItem } from '@/components/add-transaction/category-grid';
import { TransactionOptionsRow } from '@/components/add-transaction/transaction-options-row';
import { TransactionTypeTabs, type TransactionTypeTab } from '@/components/add-transaction/transaction-type-tabs';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAccounts } from '@/hooks/use-accounts';
import { useTheme } from '@/hooks/use-theme';

// TODO(dummy data): 接分类种子数据 + db/categories.ts 之后，把这两份列表换成 useCategories('EXPENSE' | 'INCOME')
const EXPENSE_CATEGORIES: CategoryGridItem[] = [
  { id: 'cat-food', name: '餐饮', icon: '🍜' },
  { id: 'cat-shopping', name: '购物', icon: '🛍️' },
  { id: 'cat-transport', name: '交通', icon: '🚌' },
  { id: 'cat-daily', name: '日常', icon: '🏠' },
  { id: 'cat-entertainment', name: '娱乐', icon: '🎮' },
  { id: 'cat-medical', name: '医疗', icon: '💊' },
  { id: 'cat-education', name: '学习', icon: '📚' },
  { id: 'cat-social', name: '社交', icon: '🤝' },
  { id: 'cat-other-expense', name: '其他', icon: '📦' },
];
const INCOME_CATEGORIES: CategoryGridItem[] = [
  { id: 'cat-salary', name: '工资', icon: '💰' },
  { id: 'cat-bonus', name: '奖金', icon: '🧧' },
  { id: 'cat-parttime', name: '兼职', icon: '💼' },
  { id: 'cat-other-income', name: '其他收入', icon: '💵' },
];

// 支出/收入的完整记账表单。支出/收入切换直接做进原生顶部导航栏（见下面的 <Stack.Screen options>），
// 不再单独画一条自己的 header 行——避免和原生 header 重叠出现两条
export default function AddScreen() {
  const theme = useTheme();
  const { data: accounts } = useAccounts();

  const [type, setType] = useState<TransactionTypeTab>('EXPENSE');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [amount, setAmount] = useState('0');
  const [topic, setTopic] = useState('');
  const [remark, setRemark] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [isReimbursable, setIsReimbursable] = useState(false);
  const [excludeFromStats, setExcludeFromStats] = useState(false);

  useEffect(() => {
    if (!accountId && accounts && accounts.length > 0) {
      setAccountId(accounts[0].id);
    }
  }, [accounts, accountId]);

  useEffect(() => {
    setSelectedCategoryId(null);
  }, [type]);

  const categories = type === 'INCOME' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const numericAmount = Number(amount);
  const canSave = !!selectedCategoryId && !!accountId && numericAmount > 0;

  const handleSave = () => {
    if (!canSave || !selectedCategoryId || !accountId) return;
    const category = categories.find((c) => c.id === selectedCategoryId);

    // TODO(dummy data): 换成 useCreateTransaction().mutate(...)，实际写入 SQLite
    console.log('new transaction (dummy)', {
      title: topic.trim() || category?.name || '',
      remarks: remark.trim() || null,
      amount: numericAmount,
      type,
      categoryId: selectedCategoryId,
      accountId,
      tags,
      isReimbursable,
      excludeFromStats,
      date: new Date().toISOString(),
    });

    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: () => <TransactionTypeTabs value={type} onChange={setType} />,
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Ionicons name="close" size={24} color={theme.text} />
            </Pressable>
          ),
        }}
      />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}>
        <ThemedView type="backgroundElement" style={[styles.categoryCard, { borderColor: theme.backgroundSelected }]}>
          <CategoryGrid categories={categories} selectedId={selectedCategoryId} onSelect={setSelectedCategoryId} />
        </ThemedView>
      </ScrollView>

      <ThemedView type="backgroundElement" style={styles.bottomSheet}>
        <View style={styles.noteRow}>
          <View style={styles.noteInputs}>
            <TextInput
              value={topic}
              onChangeText={setTopic}
              placeholder="点击输入标题"
              placeholderTextColor={theme.textSecondary}
              style={[styles.noteInput, { color: theme.text }]}
            />
            <TextInput
              value={remark}
              onChangeText={setRemark}
              placeholder="点击输入备注"
              placeholderTextColor={theme.textSecondary}
              style={[styles.noteInput, { color: theme.text }]}
            />
          </View>
          <ThemedText type="title" style={styles.amountDisplay}>
            RM{numericAmount.toFixed(2)}
          </ThemedText>
        </View>

        <TransactionOptionsRow
          tags={tags}
          onTagsChange={setTags}
          isReimbursable={isReimbursable}
          onReimbursableChange={setIsReimbursable}
          excludeFromStats={excludeFromStats}
          onExcludeFromStatsChange={setExcludeFromStats}
          onCameraPress={() => {
            // TODO(dummy data): 接 Cloudinary 客户端直传后开放拍照/选图，当前只是 UI 占位
            console.log('camera pressed (todo: Cloudinary upload)');
          }}
        />

        <AmountKeypad value={amount} onChange={setAmount} onSave={handleSave} saveDisabled={!canSave} />
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: Spacing.two,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  categoryCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: Spacing.half,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
  },
  bottomSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: Spacing.three,
    gap: Spacing.three,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.two,
    gap: Spacing.two,
  },
  noteInputs: {
    flex: 1,
    gap: Spacing.one,
  },
  noteInput: {
    fontSize: 14,
  },
  amountDisplay: {
    fontSize: 28,
    lineHeight: 34,
  },
});
