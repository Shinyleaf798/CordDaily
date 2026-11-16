import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ModalHost } from '@/components/ui/modal-host';
import { ModalSheet, useSheetTransition } from '@/components/ui/modal-sheet';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import type { BatchTransactionPatch, TransactionWithCategory } from '@/db/transactions';
import { useAccounts } from '@/hooks/use-accounts';
import { useBatchUpdateTransactions, useRecentTags } from '@/hooks/use-transactions';
import { useTheme } from '@/hooks/use-theme';

type TextField = 'title' | 'remarks' | 'merchant' | 'location';

/** 顺序跟记账页的输入块一致：主题、备注、店名、地点 */
const FIELDS: { key: TextField; label: string; clearable: boolean }[] = [
  // 主题不能清空：它是记账的必填项，库里也是 NOT NULL
  { key: 'title', label: '主题', clearable: false },
  { key: 'remarks', label: '备注', clearable: true },
  { key: 'merchant', label: '店名', clearable: true },
  { key: 'location', label: '地点', clearable: true },
];

type FieldDraft = { value: string; clear: boolean };

type BatchEditSheetProps = {
  transactions: TransactionWithCategory[];
  onDismiss: () => void;
  /** 改完了，带上实际改了几笔。调用方据此退出勾选模式、报一句结果 */
  onDone: (count: number) => void;
};

/**
 * 一键改一批账单的主题、备注、店名、地点、账户和标签（金额、日期、分类不在这里，见 batchUpdateTransactions）。
 *
 * **每一格默认是「不改」**，填了字才改。灰色的占位字是这批账当前的值——
 * 全都一样时直接显示那个值（「今天充值30元」），各不相同时写「多个不同的值」。
 * 这样用户在动手之前就知道自己要盖掉的是什么，也看得出哪几格其实不用碰。
 *
 * 想把备注整个删掉要点那一格的「清空」：留空表示"不改"，所以"改成空"得是另一个明确的动作，
 * 否则这两件事分不开（见 BatchTransactionPatch 的三态）。
 *
 * **标签是加 / 去，不是改成。** 这批账现有的标签列成一排，注明「全部」还是「N 笔有」，
 * 点一下标成去掉；底下输入或点「最近用过」加新的。每一笔原有的其他标签不受影响——
 * 所以主题、备注各不相同的一批账，也能只给它们统一挂上一个标签，别的格子留空就是不改。
 */
export function BatchEditSheet({ transactions, onDismiss, onDone }: BatchEditSheetProps) {
  const theme = useTheme();
  const sheet = useSheetTransition(onDismiss, 0.85);
  const { data: accounts } = useAccounts();
  const batchUpdate = useBatchUpdateTransactions();

  const [drafts, setDrafts] = useState<Record<TextField, FieldDraft>>({
    title: { value: '', clear: false },
    remarks: { value: '', clear: false },
    merchant: { value: '', clear: false },
    location: { value: '', clear: false },
  });
  /** null = 账户不改 */
  const [accountId, setAccountId] = useState<string | null>(null);
  const { data: recentTags } = useRecentTags();
  const [addTags, setAddTags] = useState<string[]>([]);
  const [removeTags, setRemoveTags] = useState<Set<string>>(new Set());
  const [draftTag, setDraftTag] = useState('');

  // 这批账现有的标签和各自出现在几笔里，按出现的先后排（跟每笔自己的标签顺序一致）
  const tagCounts = new Map<string, number>();
  for (const t of transactions) {
    for (const tag of t.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }
  const existingTags = [...tagCounts.entries()];
  // 「最近用过」里去掉已经要加的、以及这批账每一笔都已经有的——点了也不会有任何变化
  const suggestedTags = (recentTags ?? []).filter(
    (tag) => !addTags.includes(tag) && tagCounts.get(tag) !== transactions.length,
  );

  const addTag = (raw: string) => {
    const tag = raw.trim();
    if (!tag) return;
    setAddTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
    // 刚标了去掉、又重新加回来：以最后这个动作为准
    setRemoveTags((prev) => {
      if (!prev.has(tag)) return prev;
      const next = new Set(prev);
      next.delete(tag);
      return next;
    });
  };
  const commitDraftTag = () => {
    addTag(draftTag);
    setDraftTag('');
  };
  const toggleRemoveTag = (tag: string) =>
    setRemoveTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });

  const updateDraft = (key: TextField, next: Partial<FieldDraft>) =>
    setDrafts((prev) => ({ ...prev, [key]: { ...prev[key], ...next } }));

  // 这一格的占位字：这批账当前的值。全都一样就是那个值，不一样就说不一样，全空就说空着
  const currentLabel = (key: TextField) => {
    const values = new Set(transactions.map((t) => t[key] ?? ''));
    if (values.size > 1) return '多个不同的值';
    const [only] = values;
    return only ? only : '（空）';
  };

  const currentAccountId = new Set(transactions.map((t) => t.accountId)).size === 1 ? transactions[0]?.accountId : null;

  const patch: BatchTransactionPatch = {};
  for (const { key } of FIELDS) {
    const draft = drafts[key];
    if (draft.clear) {
      if (key !== 'title') patch[key] = null;
    } else if (draft.value.trim()) {
      patch[key] = draft.value;
    }
  }
  if (accountId && accountId !== currentAccountId) patch.accountId = accountId;
  // 输入框里打了字、还没按回车就点保存：照样算进去，不然那个字会被悄悄丢掉
  const pendingAdd = [...new Set([...addTags, draftTag.trim()].filter(Boolean))];
  // 每一笔都已经有的标签再"加"一次什么也不会变，不算改动——否则保存按钮亮了、点下去却改了 0 笔
  const effectiveAdd = pendingAdd.filter((tag) => tagCounts.get(tag) !== transactions.length);
  if (effectiveAdd.length) patch.addTags = effectiveAdd;
  if (removeTags.size) patch.removeTags = [...removeTags];
  const hasChanges = Object.keys(patch).length > 0;

  const save = () => {
    if (!hasChanges || batchUpdate.isPending) return;
    // 改一批是没法撤销的（没有"上一个版本"可退），所以停一下让人确认数量
    Alert.alert(`修改这 ${transactions.length} 笔账单？`, '金额、日期和分类不会变，各笔原有的其他标签保留。', [
      { text: '取消', style: 'cancel' },
      {
        text: '修改',
        onPress: () =>
          batchUpdate.mutate(
            { ids: transactions.map((t) => t.id), patch },
            { onSuccess: (count) => sheet.close(() => onDone(count)) },
          ),
      },
    ]);
  };

  return (
    <ModalHost visible animation="none" onRequestClose={() => sheet.close()}>
      <ModalSheet title={`修改 ${transactions.length} 笔账单`} transition={sheet}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText type="small" themeColor="textSecondary">
            留空的格子不改。灰字是这几笔现在的内容。
          </ThemedText>

          <View style={[styles.card, { backgroundColor: theme.background }]}>
            {FIELDS.map(({ key, label, clearable }, index) => {
              const draft = drafts[key];
              return (
                <View
                  key={key}
                  style={[
                    styles.fieldRow,
                    index > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.divider } : null,
                  ]}>
                  <ThemedText type="default" style={styles.fieldLabel}>
                    {label}
                  </ThemedText>
                  <TextInput
                    value={draft.clear ? '' : draft.value}
                    onChangeText={(value) => updateDraft(key, { value })}
                    editable={!draft.clear}
                    placeholder={draft.clear ? '将清空' : currentLabel(key)}
                    placeholderTextColor={draft.clear ? theme.expense : theme.textSecondary}
                    style={[styles.input, { color: theme.text }]}
                  />
                  {clearable ? (
                    <Pressable
                      onPress={() => updateDraft(key, { clear: !draft.clear, value: '' })}
                      hitSlop={6}
                      style={[
                        styles.clearChip,
                        { backgroundColor: draft.clear ? theme.cardHighlight : theme.backgroundElement },
                      ]}>
                      <ThemedText
                        type="small"
                        style={draft.clear ? { color: theme.onCardHighlight } : { color: theme.textSecondary }}>
                        清空
                      </ThemedText>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>

          <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
            账户
          </ThemedText>
          <View style={styles.accountChips}>
            <AccountChip label="不改" active={!accountId} onPress={() => setAccountId(null)} />
            {(accounts ?? []).map((account) => (
              <AccountChip
                key={account.id}
                label={account.id === currentAccountId ? `${account.name}（当前）` : account.name}
                active={accountId === account.id}
                onPress={() => setAccountId(account.id)}
              />
            ))}
          </View>

          <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
            标签（加上的补进每一笔，点现有的标签可去掉）
          </ThemedText>
          {existingTags.length > 0 || addTags.length > 0 ? (
            <View style={styles.accountChips}>
              {existingTags.map(([tag, count]) => {
                const removing = removeTags.has(tag);
                return (
                  <Pressable
                    key={`has-${tag}`}
                    onPress={() => toggleRemoveTag(tag)}
                    accessibilityLabel={removing ? `取消去掉标签 ${tag}` : `去掉标签 ${tag}`}
                    style={[styles.accountChip, { backgroundColor: theme.background }]}>
                    <ThemedText
                      type="small"
                      style={
                        removing ? { color: theme.expense, textDecorationLine: 'line-through' } : undefined
                      }>
                      {tag}
                      <ThemedText type="small" themeColor="textSecondary">
                        {count === transactions.length ? ' · 全部' : ` · ${count} 笔`}
                      </ThemedText>
                    </ThemedText>
                  </Pressable>
                );
              })}
              {addTags.map((tag) => (
                <Pressable
                  key={`add-${tag}`}
                  onPress={() => setAddTags((prev) => prev.filter((t) => t !== tag))}
                  accessibilityLabel={`撤销加上标签 ${tag}`}
                  style={[styles.accountChip, { backgroundColor: theme.cardHighlight }]}>
                  <ThemedText type="small" style={{ color: theme.onCardHighlight }}>
                    + {tag} ×
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          ) : null}
          <TextInput
            value={draftTag}
            onChangeText={setDraftTag}
            onSubmitEditing={commitDraftTag}
            submitBehavior="submit"
            returnKeyType="done"
            placeholder="输入新标签，按完成加上"
            placeholderTextColor={theme.textSecondary}
            style={[styles.tagInput, { color: theme.text, backgroundColor: theme.background }]}
          />
          {suggestedTags.length > 0 ? (
            <View style={styles.accountChips}>
              {suggestedTags.map((tag) => (
                <Pressable
                  key={`recent-${tag}`}
                  onPress={() => addTag(tag)}
                  style={[styles.accountChip, styles.recentChip, { borderColor: theme.backgroundSelected }]}>
                  <ThemedText type="small">+ {tag}</ThemedText>
                </Pressable>
              ))}
            </View>
          ) : null}

          {batchUpdate.error ? (
            <ThemedText type="small" style={{ color: theme.expense }}>
              没能保存：{batchUpdate.error.message}
            </ThemedText>
          ) : null}

          <Pressable
            onPress={save}
            disabled={!hasChanges || batchUpdate.isPending}
            style={[
              styles.saveButton,
              { backgroundColor: theme.cardHighlight, opacity: hasChanges && !batchUpdate.isPending ? 1 : 0.4 },
            ]}>
            <ThemedText style={[styles.saveText, { color: theme.onCardHighlight }]}>
              {batchUpdate.isPending ? '正在修改…' : '保存修改'}
            </ThemedText>
          </Pressable>
        </ScrollView>
      </ModalSheet>
    </ModalHost>
  );
}

function AccountChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.accountChip, { backgroundColor: active ? theme.cardHighlight : theme.background }]}>
      <ThemedText type="small" style={active ? { color: theme.onCardHighlight } : undefined}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.two,
    paddingBottom: Spacing.two,
  },
  card: {
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 48,
  },
  fieldLabel: {
    width: 40,
  },
  input: {
    flex: 1,
    // Android 的 TextInput 自带内距，不清掉的话跟左边的标签对不齐
    padding: 0,
    fontSize: 15,
  },
  clearChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  sectionLabel: {
    marginTop: Spacing.one,
  },
  accountChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  accountChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  tagInput: {
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    height: 44,
    fontSize: 15,
  },
  recentChip: {
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  saveButton: {
    marginTop: Spacing.two,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
