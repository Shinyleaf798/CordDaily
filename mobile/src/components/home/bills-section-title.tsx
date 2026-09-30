import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { useTheme } from '@/hooks/use-theme';

type BillsSectionTitleProps = {
  /** 「近7天账单」/「本月账单」…… 跟着用户选的区间走（见 constants/home-range） */
  title: string;
};

/**
 * 账单那一段的标题行：图标 + 标题 + 右边的「全部账单 ›」。
 *
 * 抽出来是因为下半两种画法（一天一张卡 / 通栏细线）顶上都是这一行——
 * 而它们是可以互换的两块，同一行在两个文件里各写一遍，早晚会走散。
 *
 * 图标用强调色：这一行是首页唯一的分区标题，底下那一大段都归它管。
 * 但图标只有 16、字重也没加粗——它是个路标，不该比下面每一笔的金额还响。
 *
 * 右边那个入口**不受区间影响**：不管首页现在显示的是 7 天还是一年，
 * 「全部账单」去的都是同一个地方。它是个出口，不是这一段的开关——
 * 换区间是在「编辑」里做的事（首页底部那颗按钮）。
 */
export function BillsSectionTitle({ title }: BillsSectionTitleProps) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <Ionicons name="receipt-outline" size={16} color={theme.cardHighlight} />
        <ThemedText style={styles.text}>{title}</ThemedText>
      </View>

      <Pressable onPress={() => router.push('/bill-overview')} hitSlop={8} style={styles.link}>
        <ThemedText type="small" themeColor="textSecondary">
          全部账单
        </ThemedText>
        <Ionicons name="chevron-forward" size={14} color={theme.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    // 标题长到「近3个月账单」时先压这半边，右边那个出口任何时候都不许被挤掉
    flexShrink: 1,
    minWidth: 0,
  },
  text: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600',
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flexShrink: 0,
  },
});
