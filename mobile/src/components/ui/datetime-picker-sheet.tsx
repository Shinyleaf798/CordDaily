import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ModalHost } from '@/components/ui/modal-host';
import { ModalSheet, useSheetTransition } from '@/components/ui/modal-sheet';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { addDays, formatClockTime, isSameDay, startOfDay, withTime } from '@/utils/date';

type DateTimePickerSheetProps = {
  /** 当前值，决定打开时停在哪个月、哪一格高亮、时间显示几点几分 */
  value: Date;
  /** 按下「确定」时把选好的日期 + 时间一起给出去 */
  onSelect: (date: Date) => void;
  onDismiss: () => void;
};

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const TIME_ITEM_WIDTH = 44;

/**
 * 从底部升起的日期 + 时间选择器。自己画而不是用 @react-native-community/datetimepicker：
 * 那个是系统原生控件，iOS 和 Android 长得完全不一样，也不吃这个 App 的主题色板——
 * 在一屏自定义配色的记账界面里弹出一个系统灰的转轮，观感上像是走错了 App。
 *
 * **改成「草稿 + 确定」而不是点一天就关**：加了时间之后，点一天立刻关闭就没机会再调时分了，
 * 而"先调时间再点日子"这种隐含的操作顺序没人猜得到。现在整个弹层只改一个草稿值，
 * 按确定才生效，先点哪个都一样。
 *
 * 底部一行左边是时间、右边是确定：时间是这一层里唯一的第二个变量，
 * 放在跟确定同一行、隔开两端，既不会被当成日历的一部分，也不会被漏看。
 *
 * 放 ui/ 而不是 add-transaction/：它只认识"一个时间点"，不认识交易、分类、账户。
 */
export function DateTimePickerSheet({ value, onSelect, onDismiss }: DateTimePickerSheetProps) {
  const theme = useTheme();
  // 0.8：日历 + 时间带比别的弹层高。这个比例同时决定了起始位移，所以只在这里写一次
  const sheet = useSheetTransition(onDismiss, 0.8);

  // 草稿：日期和时间都改这一个值。翻月份不算改值，所以单独存
  const [draft, setDraft] = useState(value);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));
  const [isTimeOpen, setIsTimeOpen] = useState(false);

  const today = startOfDay(new Date());

  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  // 下个月的第 0 天 = 这个月的最后一天，避免自己判断闰年和大小月
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = new Date(year, month, 1).getDay();

  /**
   * 切成一周一行的二维数组。
   *
   * 原来是一个 flexWrap 容器 + 每格 width: '14.2857%'，那样在某些屏宽上会**排不下 7 列**：
   * 1/7 是无限小数，每格四舍五入到整数像素之后 7 格加起来可能超过容器宽度，
   * 第七格就被挤到下一行——表头会变成"日一二三四五 / 六"，整张日历跟着错位。
   * 一周一个真的 row + 每格 flex: 1 就没有这个问题，剩余像素由 flex 自己分。
   */
  const weeks = useMemo(() => {
    const cells: (number | null)[] = [
      ...Array.from({ length: leadingBlanks }, () => null),
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    // 补齐最后一周：不补的话那一行只有两三格，flex: 1 会把它们摊开占满整行
    while (cells.length % 7 !== 0) cells.push(null);
    return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
  }, [leadingBlanks, daysInMonth]);

  const shiftMonth = (delta: number) => setVisibleMonth(new Date(year, month + delta, 1));

  // 换日子只换年月日，时分原样留着——反过来也一样，两个维度互不干扰
  const pickDay = (day: Date) => setDraft(withTime(day, draft.getHours(), draft.getMinutes()));
  const pickTime = (hours: number, minutes: number) => setDraft(withTime(draft, hours, minutes));

  const quickPicks = [
    { label: '今天', date: today },
    { label: '昨天', date: addDays(today, -1) },
    { label: '前天', date: addDays(today, -2) },
  ];

  return (
    <ModalHost visible animation="none" onRequestClose={() => sheet.close()}>
      <ModalSheet title="选择日期" transition={sheet}>
        {/* 日历和时间带包在可滚动区里，底部那一行留在外面。
            时间带展开后内容在小屏上会超过弹层高度，而 ModalSheet 只是 maxHeight，超出部分直接裁掉——
            被裁掉的恰好是最下面的「确定」，那就又变成一个"点了没反应"的按钮 */}
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          <View style={styles.quickRow}>
            {quickPicks.map((pick) => {
              const isActive = isSameDay(pick.date, draft);
              return (
                <Pressable
                  key={pick.label}
                  onPress={() => pickDay(pick.date)}
                  style={[styles.quickChip, { backgroundColor: isActive ? theme.cardHighlight : theme.background }]}>
                  <ThemedText type="small" style={isActive ? { color: theme.onCardHighlight } : undefined}>
                    {pick.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.monthRow}>
            <Pressable onPress={() => shiftMonth(-1)} hitSlop={12} style={styles.monthArrow}>
              <Ionicons name="chevron-back" size={20} color={theme.textSecondary} />
            </Pressable>
            <ThemedText type="default">
              {year}年{month + 1}月
            </ThemedText>
            <Pressable onPress={() => shiftMonth(1)} hitSlop={12} style={styles.monthArrow}>
              <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.week}>
            {WEEKDAYS.map((label) => (
              <View key={label} style={styles.cell}>
                <ThemedText type="small" themeColor="textSecondary">
                  {label}
                </ThemedText>
              </View>
            ))}
          </View>

          {weeks.map((week, weekIndex) => (
            <View key={weekIndex} style={styles.week}>
              {week.map((day, dayIndex) => {
                // null = 月初之前或月末之后的补位，占着格子不画东西
                if (day === null) return <View key={dayIndex} style={styles.cell} />;

                const date = new Date(year, month, day);
                const isSelected = isSameDay(date, draft);
                const isToday = isSameDay(date, today);
                // 未来的日期不拦：预付了下个月的房租、提前记一笔，都是真实存在的用法
                return (
                  <Pressable key={dayIndex} onPress={() => pickDay(date)} style={styles.cell}>
                    <View
                      style={[
                        styles.dayCircle,
                        isSelected && { backgroundColor: theme.cardHighlight },
                        !isSelected && isToday && { borderWidth: 1, borderColor: theme.cardHighlight },
                      ]}>
                      <ThemedText type="small" style={isSelected ? { color: theme.onCardHighlight } : undefined}>
                        {day}
                      </ThemedText>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}

          {isTimeOpen ? (
            <View style={styles.timeStrips}>
              <TimeStrip values={HOURS} selected={draft.getHours()} onSelect={(h) => pickTime(h, draft.getMinutes())} />
              <TimeStrip values={MINUTES} selected={draft.getMinutes()} onSelect={(m) => pickTime(draft.getHours(), m)} />
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.bottomRow}>
          {/* 时间收在一个 chip 里默认不展开：绝大多数记账就是"刚刚"，
              时分是少数情况才要改的东西，常驻两条数字带会让日历被挤下去 */}
          <Pressable
            onPress={() => setIsTimeOpen((open) => !open)}
            style={[
              styles.timeChip,
              { backgroundColor: theme.background, borderColor: isTimeOpen ? theme.cardHighlight : 'transparent' },
            ]}>
            <Ionicons name="time-outline" size={16} color={theme.textSecondary} />
            <ThemedText type="small">{formatClockTime(draft)}</ThemedText>
            <Ionicons name={isTimeOpen ? 'chevron-down' : 'chevron-up'} size={14} color={theme.textSecondary} />
          </Pressable>

          <Pressable
            onPress={() => sheet.close(() => onSelect(draft))}
            style={[styles.confirmButton, { backgroundColor: theme.cardHighlight }]}>
            <ThemedText type="small" style={{ color: theme.onCardHighlight, fontWeight: '700' }}>
              确定
            </ThemedText>
          </Pressable>
        </View>
      </ModalSheet>
    </ModalHost>
  );
}

/**
 * 横向滚动的数字带，小时和分钟各一条。
 *
 * 分钟做成 60 个而不是每 5 分钟一跳：账单时间本来就该能如实填。横着滚一条数字带，
 * 60 个和 12 个的操作成本差不多，但少了"我那笔是 16:07，只能选 16:05"的将就。
 * 打开时用 contentOffset 直接跳到选中项，不用滚半天去找现在几点。
 */
function TimeStrip({
  values,
  selected,
  onSelect,
}: {
  values: number[];
  selected: number;
  onSelect: (value: number) => void;
}) {
  const theme = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentOffset={{ x: Math.max(values.indexOf(selected) - 2, 0) * TIME_ITEM_WIDTH, y: 0 }}
      contentContainerStyle={styles.stripContent}>
      {values.map((item) => {
        const isSelected = item === selected;
        return (
          <Pressable
            key={item}
            onPress={() => onSelect(item)}
            style={[
              styles.stripItem,
              { backgroundColor: isSelected ? theme.cardHighlight : theme.background },
            ]}>
            <ThemedText type="small" style={isSelected ? { color: theme.onCardHighlight } : undefined}>
              {String(item).padStart(2, '0')}
            </ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // flexShrink 让它在弹层放不下时缩成"剩余空间"并自己滚，而不是把底部那行挤出屏幕
  body: {
    flexShrink: 1,
  },
  bodyContent: {
    gap: Spacing.two,
  },
  quickRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  quickChip: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.two,
  },
  monthArrow: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  week: {
    flexDirection: 'row',
  },
  // flex: 1 而不是 width: '14.2857%'——百分比在 7 列上会因四舍五入排不下，见上面 weeks 那段注释
  cell: {
    flex: 1,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeStrips: {
    gap: Spacing.one,
  },
  stripContent: {
    gap: Spacing.one,
  },
  stripItem: {
    width: TIME_ITEM_WIDTH - Spacing.one,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.one,
  },
  timeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: Spacing.two,
  },
  confirmButton: {
    height: 36,
    borderRadius: 10,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
