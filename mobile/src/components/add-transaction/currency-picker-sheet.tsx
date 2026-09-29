import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ModalHost } from '@/components/ui/modal-host';
import { ModalSheet, useSheetTransition } from '@/components/ui/modal-sheet';
import { ThemedText } from '@/components/ui/themed-text';
import { BASE_CURRENCY } from '@/constants/currencies';
import { Spacing } from '@/constants/theme';
import { useEnabledCurrencies } from '@/hooks/use-currencies';
import { useExchangeRates, useRefreshRates } from '@/hooks/use-exchange-rates';
import { useTheme } from '@/hooks/use-theme';
import { formatDateTimeLabel } from '@/utils/date';

type CurrencyPickerSheetProps = {
  selectedCode: string;
  onSelect: (code: string) => void;
  onDismiss: () => void;
};

/**
 * 选这笔账用的是哪种钱。
 *
 * 右边那一列数字是**汇率本身**（1 MYR 换得到多少），不是别的：选币种这个动作真正的问题
 * 不是"叫什么名字"——那个看图标就知道了——而是"选了它，我这 500 块会变成多少"。
 * 把汇率摆在选项上，用户在按下去之前就能判断这个数对不对，
 * 而不是选完回到表单再去核对一次。
 *
 * 列的是**用户启用的那几个**（见 hooks/use-currencies），不是目录里全部二十来种。
 * 加减在设置页做，入口就是标题右边那个齿轮。
 *
 * 汇率来自 Wise（见 api/wise.ts），拿不到就用缓存里的旧值，一格都不空着——
 * 记账不能因为没网就停下来（CLAUDE.md 原则#1）。
 */
export function CurrencyPickerSheet({ selectedCode, onSelect, onDismiss }: CurrencyPickerSheetProps) {
  const theme = useTheme();
  const sheet = useSheetTransition(onDismiss);
  const { data: currencies } = useEnabledCurrencies();
  const { data: rates, isPending } = useExchangeRates();
  const refresh = useRefreshRates();

  // 全表同一时刻拉回来的，取任意一行的时间就是"这批汇率有多新"
  const fetchedAt = Object.values(rates?.byCode ?? {})[0]?.fetchedAt ?? null;
  const problem = refresh.error?.message ?? rates?.refreshError ?? null;

  return (
    <ModalHost visible animation="none" onRequestClose={() => sheet.close()}>
      <ModalSheet
        title="选择币种"
        transition={sheet}
        headerRight={
          <View style={styles.headerActions}>
            {/* 齿轮先走完出场动画再跳页：直接 push 的话，弹层会连着底下那一屏
                一起被新页面盖住，返回时又整个露出来闪一下（同 sheet.close 的其它用法） */}
            <Pressable onPress={() => sheet.close(() => router.push('/settings/currency'))} hitSlop={10}>
              <Ionicons name="settings-outline" size={20} color={theme.textSecondary} />
            </Pressable>
            <Pressable onPress={() => refresh.mutate()} disabled={refresh.isPending} hitSlop={10}>
              {refresh.isPending ? (
                <ActivityIndicator size="small" color={theme.textSecondary} />
              ) : (
                <Ionicons name="refresh" size={20} color={theme.textSecondary} />
              )}
            </Pressable>
          </View>
        }>
        <ThemedText type="small" themeColor="textSecondary">
          {problem
            ? problem
            : fetchedAt
              ? `汇率更新于 ${formatDateTimeLabel(new Date(fetchedAt))}`
              : rates?.hasToken
                ? '还没拉过汇率，点右上角刷新'
                : '还没连 Wise，点右上角齿轮去填 token 或手填汇率'}
        </ThemedText>

        <ScrollView contentContainerStyle={styles.list}>
          {(currencies?.all ?? []).map((currency) => {
            const isSelected = currency.code === selectedCode;
            const isBase = currency.code === BASE_CURRENCY;
            const rate = rates?.byCode[currency.code];

            return (
              <Pressable
                key={currency.code}
                onPress={() => sheet.close(() => onSelect(currency.code))}
                style={[
                  styles.row,
                  {
                    backgroundColor: theme.background,
                    borderColor: isSelected ? theme.cardHighlight : 'transparent',
                  },
                ]}>
                <ThemedText style={styles.flag}>{currency.flag}</ThemedText>

                <View style={styles.rowText}>
                  <ThemedText type="default">{currency.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {currency.code} ({currency.symbol})
                  </ThemedText>
                </View>

                {/* 本位币写 1.0 而不是留空：它跟别的币种是同一类东西，
                    空着会让人以为这一行还没加载完 */}
                <ThemedText
                  type="small"
                  themeColor={rate?.source === 'manual' ? 'textSecondary' : undefined}
                  style={styles.rate}>
                  {isBase ? '1.0' : rate ? formatRate(rate.perBase) : '—'}
                </ThemedText>
              </Pressable>
            );
          })}

          {/* 一个外币都没启用时，这张列表只有 MYR 一行——那看起来像坏了。
              直接把出口摆在这儿，不让人回去翻设置 */}
          {currencies && currencies.foreign.length === 0 ? (
            <Pressable
              onPress={() => sheet.close(() => router.push('/settings/currency'))}
              style={[styles.row, { backgroundColor: theme.background, borderColor: 'transparent' }]}>
              <Ionicons name="add-circle-outline" size={24} color={theme.cardHighlight} />
              <View style={styles.rowText}>
                <ThemedText type="default">添加外币</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  现在只有林吉特可选
                </ThemedText>
              </View>
            </Pressable>
          ) : null}

          {isPending ? <ActivityIndicator style={styles.loading} color={theme.textSecondary} /> : null}
        </ScrollView>
      </ModalSheet>
    </ModalHost>
  );
}

/**
 * 汇率显示六位有效数字左右。不走 utils/format 里的 formatAmount：
 * 那个是给**钱**用的（两位小数 + 千分位），而汇率不是钱——
 * 日元的 38.531208 砍成 38.53 看不出今天和昨天的区别，
 * 而 formatAmount 还会给韩元的 332.944404 加个千分位逗号，那是纯粹的噪音。
 */
function formatRate(perBase: number): string {
  if (perBase >= 100) return perBase.toFixed(3);
  if (perBase >= 1) return perBase.toFixed(4);
  return perBase.toFixed(6);
}

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
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
  flag: {
    fontSize: 24,
  },
  rowText: {
    flex: 1,
  },
  // 等宽数字，一列汇率才对得齐——不然小数点会随每行的字形宽度左右跳
  rate: {
    fontVariant: ['tabular-nums'],
  },
  loading: {
    paddingVertical: Spacing.three,
  },
});
