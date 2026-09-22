import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import type { Account } from '@/db/accounts';

type AccountRowProps = {
  account: Account;
  onPress: () => void;
};

/**
 * 账户列表的一行：只有名字。点一下编辑。
 *
 * 余额那一列拿掉了。它原本存在的理由是"期初余额这个字段得有个地方看得到"，
 * 而期初余额本身的理由是"让余额有个起点"——整条链的前提是余额要准。
 * 账户既然只是「我用什么付的」这么一个标签，这个前提就不成立了，整条链一起拆掉
 * （期初余额的输入框也一并从 account-editor 移除了）。
 */
export function AccountRow({ account, onPress }: AccountRowProps) {
  return (
    <Pressable onPress={onPress}>
      <ThemedView type="backgroundElement" style={styles.row}>
        <ThemedText style={styles.name} numberOfLines={1}>
          {account.name}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
  },
  name: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
  },
});
