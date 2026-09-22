import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ModalHost } from '@/components/ui/modal-host';
import { ModalSheet, useSheetTransition } from '@/components/ui/modal-sheet';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import type { Account } from '@/db/accounts';
import { useTheme } from '@/hooks/use-theme';

type AccountPickerSheetProps = {
  accounts: Account[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDismiss: () => void;
};

/**
 * 这笔账从哪个账户出。列表短（多数人两三个账户），所以一次全列出来，不做搜索和分组。
 *
 * 不显示余额：这里查余额要给每个账户各跑一次聚合查询，而选账户时真正要认的是名字。
 * 余额是资产页的事，在这里顺手显示只会让弹层打开变慢。
 */
export function AccountPickerSheet({ accounts, selectedId, onSelect, onDismiss }: AccountPickerSheetProps) {
  const theme = useTheme();
  const sheet = useSheetTransition(onDismiss);

  return (
    <ModalHost visible animation="none" onRequestClose={() => sheet.close()}>
      <ModalSheet title="选择账户" transition={sheet}>
        {accounts.length === 0 ? (
          // 一个账户都没有时记不了账（accountId 是 NOT NULL），所以这里要把话说清楚，
          // 而不是让用户对着一个空列表猜为什么保存按钮是灰的
          <ThemedText themeColor="textSecondary" style={styles.empty}>
            还没有账户。先去「资产」页新建一个，才能记账。
          </ThemedText>
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            {accounts.map((account) => {
              const isSelected = account.id === selectedId;
              return (
                <Pressable
                  key={account.id}
                  onPress={() => sheet.close(() => onSelect(account.id))}
                  style={[
                    styles.row,
                    {
                      backgroundColor: theme.background,
                      borderColor: isSelected ? theme.cardHighlight : 'transparent',
                    },
                  ]}>
                  <View style={styles.rowText}>
                    <ThemedText type="default">{account.name}</ThemedText>
                    {/* 原来这行是「银行卡 · MYR」。账户类型去掉之后它对每个账户都一样，
                        币种也是单一的——一行对所有选项都相同的副标题不提供任何信息 */}
                    <ThemedText type="small" themeColor="textSecondary">
                      {account.currency}
                    </ThemedText>
                  </View>
                  {isSelected ? <Ionicons name="checkmark-circle" size={20} color={theme.cardHighlight} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </ModalSheet>
    </ModalHost>
  );
}

const styles = StyleSheet.create({
  empty: {
    paddingVertical: Spacing.four,
    textAlign: 'center',
  },
  list: {
    gap: Spacing.two,
    paddingBottom: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: 12,
    borderWidth: 2,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  rowText: {
    flex: 1,
  },
});
