import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ModalHost } from '@/components/ui/modal-host';
import { ModalSheet, useSheetTransition } from '@/components/ui/modal-sheet';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import {
  anchorFor,
  describeRepeat,
  firstUpcoming,
  FREQUENCY_LABELS,
  settingFromDate,
  WEEKDAY_NAMES,
  type RecurringFrequency,
  type RepeatSetting,
} from '@/db/recurring';
import { useTheme } from '@/hooks/use-theme';
import { formatDayLabel } from '@/utils/date';

type RepeatPickerSheetProps = {
  selected: RepeatSetting | null;
  onSelect: (setting: RepeatSetting | null) => void;
  onDismiss: () => void;
  /**
   * 参考日：没选过日子时默认落在它那天，「下一次」也从它往后算。
   * 记账页传这笔账的日期；编辑页传"今天、规则原来的钟点"
   */
  reference: Date;
  /** 编辑一条已有的规则时为 false：那里没有「不重复」可选，不想要了是暂停或删除 */
  allowNone?: boolean;
};

const FREQUENCIES: RecurringFrequency[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
/** 一周从周一排起：周末两天挨在一起，比周日打头更接近人对"一周"的读法 */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const MONTHS = Array.from({ length: 12 }, (_, i) => i);

/**
 * 「重复」：先选多久一次，再选落在哪一天——每周几、每月几号、每年几月几号。
 *
 * 一层里做完，不拆成"选频率 → 再弹一层选日子"：频率和日子是同一个决定的两半，
 * 拆开的话改个日子要重新走一遍频率。「不重复」和「每天」没有日子可选，点了就关；
 * 其余三个点了在下面展开对应的日子，按「确定」才算数。
 *
 * 底下那句"首次 X 月 X 日"是这一层最要紧的反馈：选每月 1 号时今天是 22 号，
 * 用户要立刻看到下一次是下个月 1 号，而不是猜。
 */
export function RepeatPickerSheet({
  selected,
  onSelect,
  onDismiss,
  reference,
  allowNone = true,
}: RepeatPickerSheetProps) {
  const theme = useTheme();
  const sheet = useSheetTransition(onDismiss, 0.85);
  const [draft, setDraft] = useState<RepeatSetting | null>(selected);

  const pickFrequency = (frequency: RecurringFrequency | null) => {
    if (!frequency || frequency === 'DAILY') {
      sheet.close(() => onSelect(frequency ? settingFromDate('DAILY', reference) : null));
      return;
    }
    // 换频率时保留已经选好的日子（每周三 → 每月：周三那个选择留着，切回来还在）
    setDraft((prev) => ({ ...(prev ?? settingFromDate(frequency, reference)), frequency }));
  };

  const nextRun = draft ? firstUpcoming(anchorFor(draft, reference), draft.frequency, reference) : null;
  // 年付的日子按闰年的月份列：2 月要能选到 29 号，平年由 anchorFor 落到月底
  const yearlyDays = draft ? new Date(2024, draft.month + 1, 0).getDate() : 31;

  return (
    <ModalHost visible animation="none" onRequestClose={() => sheet.close()}>
      <ModalSheet title="重复" transition={sheet}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.chips}>
            {allowNone ? <Chip label="不重复" active={!draft} onPress={() => pickFrequency(null)} /> : null}
            {FREQUENCIES.map((frequency) => (
              <Chip
                key={frequency}
                label={FREQUENCY_LABELS[frequency]}
                active={draft?.frequency === frequency}
                onPress={() => pickFrequency(frequency)}
              />
            ))}
          </View>

          {draft?.frequency === 'WEEKLY' ? (
            <Section title="每周几">
              <View style={styles.chips}>
                {WEEK_ORDER.map((weekday) => (
                  <Chip
                    key={weekday}
                    label={WEEKDAY_NAMES[weekday]}
                    active={draft.weekday === weekday}
                    onPress={() => setDraft({ ...draft, weekday })}
                  />
                ))}
              </View>
            </Section>
          ) : null}

          {draft?.frequency === 'YEARLY' ? (
            <Section title="几月">
              <View style={styles.grid}>
                {MONTHS.map((month) => (
                  <DayCell
                    key={month}
                    label={`${month + 1}月`}
                    active={draft.month === month}
                    width="16.66%"
                    onPress={() =>
                      setDraft({
                        ...draft,
                        month,
                        // 3 月 31 号切到 4 月：没有 31 号，收到这个月的最后一天，免得选中一个不存在的格子
                        monthDay: Math.min(draft.monthDay, new Date(2024, month + 1, 0).getDate()),
                      })
                    }
                  />
                ))}
              </View>
            </Section>
          ) : null}

          {draft?.frequency === 'MONTHLY' || draft?.frequency === 'YEARLY' ? (
            <Section title={draft.frequency === 'MONTHLY' ? '每月几号' : '几号'}>
              <View style={styles.grid}>
                {MONTH_DAYS.slice(0, draft.frequency === 'MONTHLY' ? 31 : yearlyDays).map((day) => (
                  <DayCell
                    key={day}
                    label={String(day)}
                    active={draft.monthDay === day}
                    width="14.28%"
                    onPress={() => setDraft({ ...draft, monthDay: day })}
                  />
                ))}
              </View>
              {draft.monthDay > 28 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  没有 {draft.monthDay} 号的月份，记在那个月的最后一天。
                </ThemedText>
              ) : null}
            </Section>
          ) : null}

          <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
            {draft && nextRun
              ? allowNone
                ? `这一笔记在${formatDayLabel(reference)}，之后${describeRepeat(draft)}自动记，下一次是${formatDayLabel(nextRun)}。`
                : `${describeRepeat(draft)}，下一次是${formatDayLabel(nextRun)}。`
              : '以后到日子打开 App 时会自动记上一笔。在「我的 → 周期记账」里修改、暂停或删除。'}
          </ThemedText>

          {draft && draft.frequency !== 'DAILY' ? (
            <Pressable
              onPress={() => sheet.close(() => onSelect(draft))}
              style={[styles.confirm, { backgroundColor: theme.cardHighlight }]}>
              <ThemedText style={[styles.confirmText, { color: theme.onCardHighlight }]}>确定</ThemedText>
            </Pressable>
          ) : null}
        </ScrollView>
      </ModalSheet>
    </ModalHost>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="small" themeColor="textSecondary">
        {title}
      </ThemedText>
      {children}
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: theme.background, borderColor: active ? theme.cardHighlight : 'transparent' },
      ]}>
      <ThemedText type="default" style={active ? { color: theme.cardHighlight } : undefined}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

/** 日子网格里的一格。宽度按列数给（7 列 = 一周的宽度，跟日历的手感一致），格子本身是个圆 */
function DayCell({
  label,
  active,
  width,
  onPress,
}: {
  label: string;
  active: boolean;
  width: `${number}%`;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.cellWrap, { width }]}>
      <Pressable
        onPress={onPress}
        style={[styles.cell, { backgroundColor: active ? theme.cardHighlight : theme.background }]}>
        <ThemedText type="small" style={active ? { color: theme.onCardHighlight, fontWeight: '700' } : undefined}>
          {label}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.three,
    paddingBottom: Spacing.two,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  // 选中态用金色描边 + 金字，跟原来那一列大按钮是同一套语言，只是排成一行省出高度给下面的日子
  chip: {
    borderRadius: 12,
    borderWidth: 2,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
  },
  section: {
    gap: Spacing.two,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: Spacing.one,
  },
  cellWrap: {
    alignItems: 'center',
  },
  cell: {
    minWidth: 38,
    height: 38,
    paddingHorizontal: 6,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    paddingHorizontal: Spacing.one,
  },
  confirm: {
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
