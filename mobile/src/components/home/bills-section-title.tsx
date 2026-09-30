import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { useTheme } from '@/hooks/use-theme';

/**
 * 「近7天账单」那行标题，带一个图标。
 *
 * 抽出来是因为下半两种画法（一天一张卡 / 通栏细线）顶上都是这一行——
 * 而它们是可以互换的两块，同一句标题在两个文件里各写一遍，早晚会走散。
 *
 * 图标用强调色：这一行是首页唯一的分区标题，底下那一大段都归它管。
 * 但图标只有 16、字重也没加粗——它是个路标，不该比下面每一笔的金额还响。
 */
export function BillsSectionTitle() {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      <Ionicons name="receipt-outline" size={16} color={theme.cardHighlight} />
      <ThemedText style={styles.text}>近7天账单</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  text: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600',
  },
});
