import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { Spacing } from '@/constants/theme';
import { useTagBreakdown, useTagSummaries } from '@/hooks/use-transactions';
import { useTheme } from '@/hooks/use-theme';

// 标签汇总：标签是跟分类正交的第二个维度。
// 一趟"日本旅行"横跨机票(交通)+拉面(餐饮)+药妆(购物)，按分类永远算不出这趟一共花了多少，
// 所以这一页的重点不是列出标签，而是展开后那张"标签内部按分类拆开"的明细。
export default function TagsScreen() {
  const theme = useTheme();
  const { data: tags } = useTagSummaries();
  const [expandedTag, setExpandedTag] = useState<string | null>(null);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: true, headerTitle: '标签汇总' }} />

      <ScrollView contentContainerStyle={styles.content}>
        {!tags || tags.length === 0 ? (
          <ThemedText type="default" themeColor="textSecondary">
            还没有打过标签。记账时点「标签」给一笔消费加上「日本旅行」这类名字，同一个标签下的开销就会汇总到这里。
          </ThemedText>
        ) : (
          tags.map((tag) => (
            <ThemedView key={tag.tag} type="backgroundElement" style={styles.card}>
              <Pressable
                onPress={() => setExpandedTag((current) => (current === tag.tag ? null : tag.tag))}
                style={styles.cardHeader}>
                <View style={styles.cardHeaderText}>
                  <ThemedText type="default">{tag.tag}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {tag.count} 笔
                  </ThemedText>
                </View>
                <ThemedText type="smallBold" style={{ color: theme.expense }}>
                  RM{tag.total.toFixed(2)}
                </ThemedText>
              </Pressable>

              {expandedTag === tag.tag && <TagBreakdown tag={tag.tag} total={tag.total} />}
            </ThemedView>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// 标签内部的分类占比。条形长度用「占该标签总额的比例」而不是绝对金额，
// 这样不同量级的标签展开后都能看清结构
function TagBreakdown({ tag, total }: { tag: string; total: number }) {
  const theme = useTheme();
  const { data: breakdown } = useTagBreakdown(tag);

  if (!breakdown || breakdown.length === 0) return null;

  return (
    <View style={[styles.breakdown, { borderTopColor: theme.backgroundSelected }]}>
      {breakdown.map((row) => {
        const ratio = total > 0 ? row.total / total : 0;
        return (
          <View key={row.categoryId} style={styles.breakdownRow}>
            <ThemedText style={styles.breakdownIcon}>{row.categoryIcon ?? '📦'}</ThemedText>
            <View style={styles.breakdownMiddle}>
              <View style={styles.breakdownLabelRow}>
                <ThemedText type="small">{row.categoryName}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  RM{row.total.toFixed(2)} · {Math.round(ratio * 100)}%
                </ThemedText>
              </View>
              <View style={[styles.barTrack, { backgroundColor: theme.backgroundSelected }]}>
                <View style={[styles.barFill, { width: `${Math.max(ratio * 100, 2)}%`, backgroundColor: theme.cardHighlight }]} />
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.two,
    gap: Spacing.two,
    paddingBottom: Spacing.six,
  },
  card: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
    gap: Spacing.two,
  },
  cardHeaderText: {
    gap: 2,
  },
  breakdown: {
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  breakdownIcon: {
    fontSize: 20,
  },
  breakdownMiddle: {
    flex: 1,
    gap: Spacing.one,
  },
  breakdownLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
});
