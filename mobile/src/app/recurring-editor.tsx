import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router/js-stack';
import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccountPickerSheet } from '@/components/add-transaction/account-picker-sheet';
import { CategoryGrid, type CategoryGridItem } from '@/components/add-transaction/category-grid';
import { CurrencyPickerSheet } from '@/components/add-transaction/currency-picker-sheet';
import { RepeatPickerSheet } from '@/components/add-transaction/repeat-picker-sheet';
import { TransactionTypeTabs, type TransactionTypeTab } from '@/components/transaction/transaction-type-tabs';
import { DateTimePickerSheet } from '@/components/ui/datetime-picker-sheet';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { BASE_CURRENCY, getCurrency } from '@/constants/currencies';
import { ScreenPadding, Spacing } from '@/constants/theme';
import { isPickable } from '@/db/categories';
import { toBaseRate } from '@/db/exchange-rates';
import {
  anchorFor,
  describeRule,
  firstUpcoming,
  settingFromDate,
  type RecurringFrequency,
  type RecurringRule,
} from '@/db/recurring';
import { useAccounts } from '@/hooks/use-accounts';
import { useCategories } from '@/hooks/use-categories';
import { getPerBaseRate, useExchangeRates } from '@/hooks/use-exchange-rates';
import { useRecurringRules, useUpdateRecurringRule } from '@/hooks/use-recurring';
import { useTheme } from '@/hooks/use-theme';
import { formatClockTime, formatDayLabel, formatMonthDay } from '@/utils/date';

/**
 * 编辑一条周期记账（`/recurring-editor?id=xxx`），**每个字段都能改**：
 * 收支类型、分类、主题、备注、金额、币种、账户、频率、开始日期、结束日期。
 *
 * 不管改了什么，**只影响以后生成的**——已经记上的账是普通交易，一笔都不碰（见 updateRecurringRule）。
 *
 * 这一层只负责把规则查出来，查到了再挂表单：表单的十几个初始值直接从 props 读，
 * 不用 useEffect 往 state 里同步（同 app/add.tsx 的做法）。
 */
export default function RecurringEditorScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: rules, isPending } = useRecurringRules();
  const rule = rules?.find((r) => r.id === id);

  if (isPending) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator color={theme.cardHighlight} />
      </ThemedView>
    );
  }

  if (!rule) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText type="default">这条周期记账已经不在了</ThemedText>
      </ThemedView>
    );
  }

  return <RecurringEditorForm key={rule.id} rule={rule} />;
}

function RecurringEditorForm({ rule }: { rule: RecurringRule }) {
  const theme = useTheme();
  const update = useUpdateRecurringRule();
  const { data: accounts } = useAccounts();
  const { data: rates } = useExchangeRates();

  const [type, setType] = useState<TransactionTypeTab>(rule.type);
  // 分类按收支类型各存一份，切过去看一眼再切回来不丢（同记账页的 categoryByType）
  const [categoryByType, setCategoryByType] = useState<Record<TransactionTypeTab, string | null>>({
    EXPENSE: rule.type === 'EXPENSE' ? rule.categoryId : null,
    INCOME: rule.type === 'INCOME' ? rule.categoryId : null,
  });
  const [title, setTitle] = useState(rule.title);
  const [remarks, setRemarks] = useState(rule.remarks ?? '');
  const [amount, setAmount] = useState(String(rule.amount));
  const [currency, setCurrency] = useState(rule.currency);
  const [accountId, setAccountId] = useState(rule.accountId);
  const [frequency, setFrequency] = useState<RecurringFrequency>(rule.frequency);
  const [startDate, setStartDate] = useState(() => new Date(rule.startDate));
  const [endDate, setEndDate] = useState<Date | null>(() => (rule.endDate ? new Date(rule.endDate) : null));
  const [openSheet, setOpenSheet] = useState<'currency' | 'account' | 'frequency' | 'start' | 'end' | null>(null);

  const selectedCategoryId = categoryByType[type];

  const { data: categoryRows } = useCategories(type);
  // 停用的分类不进网格，但当前选中的那个（和它的父）留着——跟记账页编辑旧账时同一条规矩
  const categories: CategoryGridItem[] = useMemo(() => {
    const all = categoryRows ?? [];
    const byId = new Map(all.map((c) => [c.id, c]));
    const selected = selectedCategoryId ? byId.get(selectedCategoryId) : undefined;
    return all
      .filter((c) => isPickable(c, byId) || c.id === selected?.id || c.id === selected?.parentId)
      .map((c) => ({ id: c.id, name: c.name, icon: c.icon, parentId: c.parentId }));
  }, [categoryRows, selectedCategoryId]);

  const currencyMeta = getCurrency(currency);
  const numericAmount = Number(amount);
  // 小数位按币种卡：日元打出 "500.5" 存进去就是一笔不存在的钱
  const decimalsOk = !amount.includes('.') || amount.split('.')[1].length <= currencyMeta.decimals;
  const amountOk = Number.isFinite(numericAmount) && numericAmount > 0 && decimalsOk;

  // 汇率：缓存里有就用现在的（生成时也是优先用缓存，见 runDueRecurring）；
  // 没有的话，币种没换就沿用规则上那个，换了一种连缓存都没有的钱就不让存——同记账页的 'rate' 拦截
  const perBase = getPerBaseRate(rates, currency);
  const exchangeRate =
    perBase !== null ? toBaseRate(perBase) : currency === rule.currency ? rule.exchangeRate : null;

  const accountName = accounts?.find((a) => a.id === accountId)?.name ?? null;

  // 「下次」的预览。时间表（频率 / 开始日期）没动就是规则上原来那个 nextRunDate，
  // 动了就按存进去时同一个算法现算，保存后看到的跟这里写的是同一天
  const scheduleChanged = frequency !== rule.frequency || startDate.getTime() !== new Date(rule.startDate).getTime();
  const nextRun = scheduleChanged ? firstUpcoming(startDate, frequency) : new Date(rule.nextRunDate);
  const isEnded = !!endDate && nextRun > endDate;
  // 「重复」选择器的参考日：从今天往后找选的那个日子，钟点沿用规则原来的——
  // 改"每月几号"不该顺带把扣款时间改掉
  const scheduleReference = new Date(new Date().setHours(startDate.getHours(), startDate.getMinutes(), 0, 0));

  const blockerHint = !selectedCategoryId
    ? '选一个分类'
    : !title.trim()
      ? '主题不能空着'
      : !amountOk
        ? `金额要大于 0${currencyMeta.decimals === 0 ? '，而且不能有小数' : '，最多两位小数'}`
        : exchangeRate === null
          ? `还没有 ${currencyMeta.name} 的汇率——我的 → 货币汇率 里拉一次或手填`
          : endDate && endDate < startDate
            ? '结束日期不能早于开始日期'
            : null;
  const canSave = !blockerHint && !update.isPending;

  const save = () => {
    if (!canSave || !selectedCategoryId || exchangeRate === null) return;
    update.mutate(
      {
        id: rule.id,
        title,
        remarks,
        amount: numericAmount,
        currency,
        exchangeRate,
        type,
        frequency,
        startDate: startDate.toISOString(),
        endDate: endDate ? endDate.toISOString() : null,
        categoryId: selectedCategoryId,
        accountId,
      },
      { onSuccess: () => router.back() },
    );
  };

  const selectCurrency = (code: string) => {
    setCurrency(code);
    // 换到没有小数的币种（日元）时，把已经打出来的小数去掉，不然那格永远是红的
    if (getCurrency(code).decimals === 0 && amount.includes('.')) setAmount(amount.split('.')[0]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{ headerShown: true, headerTitle: () => <TransactionTypeTabs value={type} onChange={setType} /> }}
      />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText type="small" themeColor="textSecondary">
          改什么都只影响以后自动记的，已经记上的账不变。
        </ThemedText>

        <ThemedView type="backgroundElement" style={styles.categoryCard}>
          <CategoryGrid
            categories={categories}
            selectedId={selectedCategoryId}
            onSelect={(categoryId) => setCategoryByType((prev) => ({ ...prev, [type]: categoryId }))}
          />
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.group}>
          <Row label="主题">
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="必填"
              placeholderTextColor={theme.textSecondary}
              style={[styles.rowInput, { color: theme.text }]}
            />
          </Row>
          <Divider />
          <Row label="备注">
            <TextInput
              value={remarks}
              onChangeText={setRemarks}
              placeholder="可不填"
              placeholderTextColor={theme.textSecondary}
              style={[styles.rowInput, { color: theme.text }]}
            />
          </Row>
          <Divider />
          <Row label="金额">
            <TextInput
              value={amount}
              onChangeText={(value) => setAmount(value.replace(/[^0-9.]/g, ''))}
              keyboardType={currencyMeta.decimals === 0 ? 'number-pad' : 'decimal-pad'}
              style={[styles.rowInput, { color: amountOk ? theme.text : theme.expense }]}
            />
          </Row>
          <Divider />
          <PickerRow label="币种" value={`${currencyMeta.name} ${currency}`} onPress={() => setOpenSheet('currency')} />
          <Divider />
          <PickerRow label="账户" value={accountName ?? '选择账户'} onPress={() => setOpenSheet('account')} />
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.group}>
          <PickerRow
            label="重复"
            value={describeRule({ frequency, startDate: startDate.toISOString() })}
            onPress={() => setOpenSheet('frequency')}
          />
          <Divider />
          <PickerRow
            label="开始日期"
            value={`${formatMonthDay(startDate)} ${startDate.getFullYear()} · ${formatClockTime(startDate)}`}
            onPress={() => setOpenSheet('start')}
          />
          <Divider />
          <PickerRow
            label="结束日期"
            value={endDate ? `${formatMonthDay(endDate)} ${endDate.getFullYear()}` : '不结束'}
            onPress={() => setOpenSheet('end')}
            trailing={
              endDate ? (
                <Pressable onPress={() => setEndDate(null)} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
                </Pressable>
              ) : null
            }
          />
        </ThemedView>

        <ThemedText type="small" themeColor="textSecondary">
          {isEnded
            ? '已经过了结束日期，以后不会再记'
            : !rule.isActive
              ? `已暂停 · 继续之后从 ${formatDayLabel(nextRun)} 起记`
              : `下次 ${formatDayLabel(nextRun)} ${formatClockTime(nextRun)}`}
          {currency !== BASE_CURRENCY ? ' · 外币按记账那天的汇率折算' : ''}
        </ThemedText>

        {update.error ? (
          <ThemedText type="small" style={{ color: theme.expense }}>
            没能保存：{update.error.message}
          </ThemedText>
        ) : blockerHint ? (
          <ThemedText type="small" themeColor="textSecondary">
            {blockerHint}
          </ThemedText>
        ) : null}

        <Pressable
          onPress={save}
          disabled={!canSave}
          style={[styles.submit, { backgroundColor: theme.cardHighlight, opacity: canSave ? 1 : 0.5 }]}>
          <ThemedText style={[styles.submitText, { color: theme.onCardHighlight }]}>
            {update.isPending ? '正在保存…' : '保存'}
          </ThemedText>
        </Pressable>
      </ScrollView>

      {openSheet === 'currency' ? (
        <CurrencyPickerSheet
          selectedCode={currency}
          onSelect={(code) => {
            selectCurrency(code);
            setOpenSheet(null);
          }}
          onDismiss={() => setOpenSheet(null)}
        />
      ) : null}

      {openSheet === 'account' ? (
        <AccountPickerSheet
          accounts={accounts ?? []}
          selectedId={accountId}
          onSelect={(picked) => {
            setAccountId(picked);
            setOpenSheet(null);
          }}
          onDismiss={() => setOpenSheet(null)}
        />
      ) : null}

      {openSheet === 'frequency' ? (
        <RepeatPickerSheet
          selected={settingFromDate(frequency, startDate)}
          allowNone={false}
          reference={scheduleReference}
          onSelect={(picked) => {
            if (picked) {
              setFrequency(picked.frequency);
              setStartDate(anchorFor(picked, scheduleReference));
            }
            setOpenSheet(null);
          }}
          onDismiss={() => setOpenSheet(null)}
        />
      ) : null}

      {openSheet === 'start' || openSheet === 'end' ? (
        <DateTimePickerSheet
          value={openSheet === 'start' ? startDate : (endDate ?? startDate)}
          onSelect={(picked) => {
            if (openSheet === 'start') setStartDate(picked);
            else setEndDate(picked);
            setOpenSheet(null);
          }}
          onDismiss={() => setOpenSheet(null)}
        />
      ) : null}
    </SafeAreaView>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.row}>
      <ThemedText style={styles.rowLabel}>{label}</ThemedText>
      {children}
    </View>
  );
}

function PickerRow({
  label,
  value,
  onPress,
  trailing,
}: {
  label: string;
  value: string;
  onPress: () => void;
  trailing?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <ThemedText style={styles.rowLabel}>{label}</ThemedText>
      <ThemedText themeColor="textSecondary" numberOfLines={1} style={styles.rowValue}>
        {value}
      </ThemedText>
      {trailing ?? <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />}
    </Pressable>
  );
}

function Divider() {
  const theme = useTheme();
  return <View style={[styles.divider, { backgroundColor: theme.divider }]} />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: ScreenPadding,
    paddingTop: Spacing.three,
    gap: 12,
    paddingBottom: Spacing.six,
  },
  // 跟记账页那张分类卡同样的内距（见 transaction-form 的 categoryCard）
  categoryCard: {
    borderRadius: 20,
    paddingHorizontal: Spacing.half,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.half,
  },
  // 行的样式照搬账户编辑页：标签在左、值靠右，输入框和只读值看起来是同一种行
  group: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    minHeight: 52,
  },
  rowLabel: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
  },
  rowInput: {
    flex: 1,
    textAlign: 'right',
    fontSize: 15,
    padding: 0,
  },
  rowValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: 15,
    lineHeight: 21,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.three,
  },
  submit: {
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
  submitText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
