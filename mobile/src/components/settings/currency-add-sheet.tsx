import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ModalHost } from '@/components/ui/modal-host';
import { ModalSheet, useSheetTransition } from '@/components/ui/modal-sheet';
import { ThemedText } from '@/components/ui/themed-text';
import type { Currency } from '@/constants/currencies';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type CurrencyAddSheetProps = {
  /** 还没启用的那些（hooks/use-currencies 的 available） */
  available: Currency[];
  onAdd: (code: string) => void;
  onDismiss: () => void;
};

/**
 * 从目录里挑一个币种加进来。
 *
 * **选完就关**，不做多选：一次加一种是绝对多数的情况（想起来要去日本了），
 * 而多选要多一个"确定"按钮和一套已选状态，换来的只是偶尔一次少点两下。
 *
 * 这里不显示汇率——那一列在设置页上，加进来之后自然就有了。
 * 在这一页显示等于要为还没启用的二十来种货币都去拉一次汇率，而其中十九种用户永远用不上。
 */
export function CurrencyAddSheet({ available, onAdd, onDismiss }: CurrencyAddSheetProps) {
  const theme = useTheme();
  const sheet = useSheetTransition(onDismiss);

  return (
    <ModalHost visible animation="none" onRequestClose={() => sheet.close()}>
      <ModalSheet title="添加币种" transition={sheet}>
        {available.length === 0 ? (
          <ThemedText themeColor="textSecondary" style={styles.empty}>
            目录里的币种都已经加上了。
          </ThemedText>
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            {available.map((currency) => (
              <Pressable
                key={currency.code}
                onPress={() => sheet.close(() => onAdd(currency.code))}
                style={[styles.row, { backgroundColor: theme.background }]}>
                <ThemedText style={styles.flag}>{currency.flag}</ThemedText>
                <View style={styles.rowText}>
                  <ThemedText type="default">{currency.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {currency.code} ({currency.symbol})
                  </ThemedText>
                </View>
                <Ionicons name="add" size={20} color={theme.cardHighlight} />
              </Pressable>
            ))}
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
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  flag: { fontSize: 24 },
  rowText: { flex: 1 },
});
