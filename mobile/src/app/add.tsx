import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AmountKeypad } from '@/components/add-transaction/amount-keypad';
import { CategoryGrid, type CategoryGridItem } from '@/components/add-transaction/category-grid';
import { TransactionNoteFields } from '@/components/add-transaction/transaction-note-fields';
import { TransactionOptionsRow } from '@/components/add-transaction/transaction-options-row';
import { TransactionTypeTabs, type TransactionTypeTab } from '@/components/add-transaction/transaction-type-tabs';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAccounts } from '@/hooks/use-accounts';
import { useCategories } from '@/hooks/use-categories';
import { useCreateTransaction } from '@/hooks/use-transactions';
import { useTheme } from '@/hooks/use-theme';

// 支出/收入的完整记账表单。支出/收入切换直接做进原生顶部导航栏（见下面的 <Stack.Screen options>），
// 不再单独画一条自己的 header 行——避免和原生 header 重叠出现两条
export default function AddScreen() {
  const theme = useTheme();
  const { data: accounts } = useAccounts();
  const createTransaction = useCreateTransaction();

  const [type, setType] = useState<TransactionTypeTab>('EXPENSE');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [amount, setAmount] = useState('0');
  const [topic, setTopic] = useState('');
  const [remark, setRemark] = useState('');
  const [merchant, setMerchant] = useState('');
  const [location, setLocation] = useState('');
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

  // 勾上报销时顺带打开"不计入统计"：这笔钱之后会回来，算进消费统计会让当月分类金额虚高，
  // 而且收回时记一笔收入也抵消不掉支出分类的数字。仍然允许用户手动再关掉，所以只在打开的那一刻联动
  const handleReimbursableChange = (value: boolean) => {
    setIsReimbursable(value);
    if (value) setExcludeFromStats(true);
  };

  const { data: categoryRows } = useCategories(type);
  const categories: CategoryGridItem[] = (categoryRows ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    icon: c.icon ?? '📦',
  }));

  const numericAmount = Number(amount);
  const canSave = !!selectedCategoryId && !!accountId && numericAmount > 0 && !createTransaction.isPending;

  const handleSave = () => {
    if (!canSave || !selectedCategoryId || !accountId) return;
    const category = categories.find((c) => c.id === selectedCategoryId);

    createTransaction.mutate(
      {
        // title 在 schema 里是 NOT NULL，但主题是可选的（随手买瓶水不会有"为了什么事"），
        // 所以按 主题 > 店名 > 分类名 兜底，保证列表主行永远有东西显示
        title: topic.trim() || merchant.trim() || category?.name || '',
        merchant,
        location,
        remarks: remark,
        amount: numericAmount,
        type,
        categoryId: selectedCategoryId,
        accountId,
        tags,
        isReimbursable,
        excludeFromStats,
      },
      { onSuccess: () => router.back() },
    );
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
        <TransactionNoteFields
          topic={topic}
          onTopicChange={setTopic}
          remark={remark}
          onRemarkChange={setRemark}
          merchant={merchant}
          onMerchantChange={setMerchant}
          location={location}
          onLocationChange={setLocation}
          amount={numericAmount}
        />

        <TransactionOptionsRow
          tags={tags}
          onTagsChange={setTags}
          isReimbursable={isReimbursable}
          onReimbursableChange={handleReimbursableChange}
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
    borderRadius: 8,
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
});
