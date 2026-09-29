import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ModalHost } from '@/components/ui/modal-host';
import { ModalSheet, useSheetTransition } from '@/components/ui/modal-sheet';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { BillTypeFilterLabels, type BillTypeFilter } from '@/hooks/use-bill-overview-data';
import { useTheme } from '@/hooks/use-theme';

const OPTIONS: BillTypeFilter[] = ['all', 'EXPENSE', 'INCOME'];

type BillFilterSheetProps = {
  value: BillTypeFilter;
  onSelect: (value: BillTypeFilter) => void;
  onDismiss: () => void;
};

/**
 * 标题行那个漏斗打开的筛选面板。只问一件事：看支出还是收入。
 *
 * 为什么是弹层不是就地放一排 tab：这一页顶上已经有两行控件（粒度 + 翻页）了，
 * 再挂第三行会让内容被推到屏幕下半部分。而收支筛选是个**选了就不常动**的设置，
 * 不值得长期占住一行——漏斗亮起来就是它当前生效的提示。
 *
 * 它影响的是分类、标签和明细，**不影响**上面的收支总览和汇总表：
 * 那两块讲的是"这一段的全貌"，按收支砍掉一半之后「结余」这一格就没有意义了。
 * 这条分工写在 BillSummaryCard 的注释里，两边一致。
 */
export function BillFilterSheet({ value, onSelect, onDismiss }: BillFilterSheetProps) {
  const theme = useTheme();
  const sheet = useSheetTransition(onDismiss, 0.4);

  return (
    <ModalHost visible animation="none" onRequestClose={() => sheet.close()}>
      <ModalSheet title="筛选" transition={sheet}>
        <View style={styles.list}>
          {OPTIONS.map((option) => {
            const isSelected = option === value;
            return (
              <Pressable
                key={option}
                onPress={() => sheet.close(() => onSelect(option))}
                style={[
                  styles.row,
                  {
                    backgroundColor: theme.background,
                    borderColor: isSelected ? theme.cardHighlight : 'transparent',
                  },
                ]}>
                <ThemedText type="default">{BillTypeFilterLabels[option]}</ThemedText>
                {isSelected ? (
                  <Ionicons name="checkmark-circle" size={20} color={theme.cardHighlight} />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </ModalSheet>
    </ModalHost>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.two,
    paddingBottom: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
});
