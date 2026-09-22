import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import type { AccountWithBalance } from '@/db/accounts';
import { formatCurrency } from '@/utils/format';

type AccountRowProps = {
  account: AccountWithBalance;
  onPress: () => void;
};

/**
 * 账户列表的一行：名字 + 余额。点一下编辑。
 *
 * 余额还是显示的——期初余额这个字段存在的**全部意义**就是让这个数字有个起点，
 * 不显示的话那个输入框就成了填完再也看不到的东西。
 * 但这里不写「余额 / 净流水」之类的标签了：一行一个数，不需要再解释它是什么。
 */
export function AccountRow({ account, onPress }: AccountRowProps) {
  return (
    <Pressable onPress={onPress}>
      <ThemedView type="backgroundElement" style={styles.row}>
        <ThemedText style={styles.name} numberOfLines={1}>
          {account.name}
        </ThemedText>
        <ThemedText style={styles.balance}>{formatCurrency(account.balance)}</ThemedText>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
  },
  // 名字占满中间：太长时压的是名字，不是金额
  name: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
  },
  balance: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
  },
});
