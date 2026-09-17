import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Stack } from 'expo-router/js-stack';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccountPickerSheet } from '@/components/add-transaction/account-picker-sheet';
import { AmountKeypad } from '@/components/add-transaction/amount-keypad';
import { CategoryGrid, type CategoryGridItem } from '@/components/add-transaction/category-grid';
import { TransactionMetaRow } from '@/components/add-transaction/transaction-meta-row';
import { TransactionNoteFields } from '@/components/add-transaction/transaction-note-fields';
import { TransactionOptionsRow } from '@/components/add-transaction/transaction-options-row';
import { TransactionTypeTabs, type TransactionTypeTab } from '@/components/transaction/transaction-type-tabs';
import { DateTimePickerSheet } from '@/components/ui/datetime-picker-sheet';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { Spacing } from '@/constants/theme';
import type { TransactionDetail } from '@/db/transactions';
import { useAccounts } from '@/hooks/use-accounts';
import { useCategories } from '@/hooks/use-categories';
import { useCreateTransaction, useUpdateTransaction } from '@/hooks/use-transactions';
import { useTheme } from '@/hooks/use-theme';

type TransactionFormProps = {
  /** 传了就是编辑那一笔，不传是记新的一笔 */
  initial: TransactionDetail | null;
};

/**
 * 记一笔 / 改一笔的表单。新建和编辑共用同一套字段，所以共用同一个组件——
 * 拆成两个只会有两份要同步维护的表单，而它们之间唯一的差别是保存时调 create 还是 update。
 *
 * 调用方（app/add.tsx）**等数据到齐了才挂载它**，所以下面十几个 useState 可以直接用 props 当初始值，
 * 不需要 useEffect 把查询结果同步进 state（那会多渲染一轮，也是 eslint 的
 * react-hooks/set-state-in-effect 要拦的写法）。
 */
export function TransactionForm({ initial }: TransactionFormProps) {
  const theme = useTheme();


  const { data: accounts } = useAccounts();
  const createTransaction = useCreateTransaction();
  const updateTransaction = useUpdateTransaction();

  const [type, setType] = useState<TransactionTypeTab>(initial?.type ?? 'EXPENSE');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(initial?.categoryId ?? null);
  // null 表示"没手动选过"，落回账户列表第一个。存 null 而不是在 effect 里 setState：
  // 后者要多渲染一轮，还是 eslint 的 react-hooks/set-state-in-effect 要拦的写法
  const [pickedAccountId, setPickedAccountId] = useState<string | null>(initial?.accountId ?? null);
  const [date, setDate] = useState(() => (initial ? new Date(initial.date) : new Date()));
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '0');
  // 编辑时用存下来的 title 回填主题。title 可能是当初从店名或分类名兜底来的，
  // 回填后看着像是用户填过主题——但这是唯一存下来的那个字符串，分不出它当初的来源
  const [topic, setTopic] = useState(initial?.title ?? '');
  const [remark, setRemark] = useState(initial?.remarks ?? '');
  const [merchant, setMerchant] = useState(initial?.merchant ?? '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [isReimbursable, setIsReimbursable] = useState(initial?.isReimbursable ?? false);
  const [excludeFromStats, setExcludeFromStats] = useState(initial?.excludeFromStats ?? false);
  // 同一时刻最多开一个选择器，所以存"哪个开着"而不是两个 boolean——
  // 两个 boolean 就存在"两个都为 true"这种本不该存在的状态
  const [openSheet, setOpenSheet] = useState<'date' | 'account' | null>(null);

  const isEditing = !!initial;
  const mutation = isEditing ? updateTransaction : createTransaction;

  const accountId = pickedAccountId ?? accounts?.[0]?.id ?? null;
  const accountName = accounts?.find((a) => a.id === accountId)?.name ?? null;

  // 切收支类型时清掉已选分类：支出和收入是两套分类，留着上一套的 id 会指向一个网格里不存在的格子。
  // 写在切换回调里而不是 effect 里，同样是为了不多渲染一轮
  const handleTypeChange = (next: TransactionTypeTab) => {
    setType(next);
    setSelectedCategoryId(null);
  };

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
    icon: c.icon,
  }));

  const numericAmount = Number(amount);

  // 保存按钮为什么是灰的，必须说出来。
  // 之前只有一个 opacity 0.5 的按钮，点了完全没反应——账户列表为空时（accountId 恒为 null）
  // 用户会以为是按钮坏了，而不会想到"我还没有账户"。
  // 一次只报一条：同时列出三个待办只会让人不知道先干哪个
  const blocker = !selectedCategoryId
    ? '先选一个分类'
    : !accountId
      ? '先选一个账户——资产页里新建一个'
      : !(numericAmount > 0)
        ? '金额还是 0'
        : null;
  const canSave = !blocker && !mutation.isPending;

  const handleSave = () => {
    if (!canSave || !selectedCategoryId || !accountId) return;
    mutation.reset();
    const category = categories.find((c) => c.id === selectedCategoryId);

    const payload = {
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
      // 日期选择器连时分一起给回来，这里直接存，不用再补时间点
      date: date.toISOString(),
      tags,
      isReimbursable,
      excludeFromStats,
    };

    // 记完/改完都回首页，而不是 router.back()。
    // ＋号是全局动作（它不属于任何一个 tab），从资产页按的＋，back 会把人送回资产页，
    // 那笔刚记的账落在哪里完全看不见；编辑是从首页的详情弹层进来的，回首页也正是原路。
    // dismissTo 会一路关掉栈顶直到首页，首页不在历史里时退化成 replace，两种情况都落在首页。
    //
    // 失败不跳转：留在原地把错误显示在保存键上方。静默失败会让人以为记上了，
    // 而记账这件事一旦以为记上了就不会再记第二遍（同 3f14b1b 修过的预算那处）
    const onSuccess = () => router.dismissTo('/');

    if (initial) {
      updateTransaction.mutate({ ...payload, id: initial.id }, { onSuccess });
    } else {
      createTransaction.mutate(payload, { onSuccess });
    }
  };

  return (
    // 自己铺主题底色，不靠导航器的默认背景——那个是 react-navigation 的 light/dark 两档，
    // 跟这个 App 的三套色板对不上，浅色主题下就是一片白
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: () => <TransactionTypeTabs value={type} onChange={handleTypeChange} />,
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Ionicons name="close" size={24} color={theme.text} />
            </Pressable>
          ),
        }}
      />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}>
        <ThemedView type="backgroundElement" style={[styles.categoryCard, { borderColor: theme.backgroundSelected }]}>
          <CategoryGrid
            categories={categories}
            selectedId={selectedCategoryId}
            onSelect={setSelectedCategoryId}
            // 带上当前收支类型，进去就停在对应那一组，不用再切一次。
            // 新建的分类由 useCreateCategory 失效缓存后自动出现在这个网格里，回来不用手动刷新
            onSettingsPress={() => router.push({ pathname: '/categories', params: { type } })}
          />
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

        <TransactionMetaRow
          date={date}
          onDatePress={() => setOpenSheet('date')}
          accountName={accountName}
          onAccountPress={() => setOpenSheet('account')}
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

        {mutation.error ? (
          <ThemedText type="small" style={[styles.saveHint, { color: theme.expense }]}>
            没能保存：{mutation.error.message}
          </ThemedText>
        ) : blocker ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.saveHint}>
            还差一步：{blocker}
          </ThemedText>
        ) : null}

        <AmountKeypad value={amount} onChange={setAmount} onSave={handleSave} saveDisabled={!canSave} />
      </ThemedView>

      {openSheet === 'date' ? (
        <DateTimePickerSheet
          value={date}
          onSelect={(picked) => {
            setDate(picked);
            setOpenSheet(null);
          }}
          onDismiss={() => setOpenSheet(null)}
        />
      ) : null}

      {openSheet === 'account' ? (
        <AccountPickerSheet
          accounts={accounts ?? []}
          selectedId={accountId}
          onSelect={(id) => {
            setPickedAccountId(id);
            setOpenSheet(null);
          }}
          onDismiss={() => setOpenSheet(null)}
        />
      ) : null}
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
  // 跟底部面板的 gap 是 Spacing.three，这行提示自己不再加上边距，免得跟保存键之间空出一大块
  saveHint: {
    paddingHorizontal: Spacing.two,
  },
  bottomSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: Spacing.three,
    gap: Spacing.three,
  },
});
