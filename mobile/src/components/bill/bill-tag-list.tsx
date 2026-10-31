import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { TagRenameDialog } from '@/components/bill/tag-rename-dialog';
import { CategoryIcon } from '@/components/category/category-icon';
import { PaceBar } from '@/components/ui/pace-bar';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import type { BillTagStat } from '@/hooks/use-bill-overview-data';
import { useTheme } from '@/hooks/use-theme';
import { formatDayKey } from '@/utils/date';
import { formatCurrency } from '@/utils/format';

type BillTagListProps = {
  tags: BillTagStat[];
  /** 选中的那一段的起止（end 不含）。「总」的时候两头都是 null。点「查看账单」时带过去 */
  range: { start: Date | null; end: Date | null };
};

/**
 * 标签统计：一个标签一行，条 + 金额 + 笔数 + 占比。**全 App 唯一看标签的地方**。
 *
 * 这里是限定时间段的：选「总」就是全部时间，选「月」就是这个月。原来统计页还有一格
 * 「标签 · 全部时间」和一个 /tags 汇总页，跟这里各做了一半，已经合并到这里（见 DECISIONS.md）。
 *
 * 排版跟分类统计那块一致（同一根条、同一个金额位置、同一个百分比宽度）：
 * 分类和标签是同一份钱的两种切法，切法不同不该长成两个样子。
 *
 * 点一行展开：这个标签按分类拆开（标签的用处正是圈起横跨几个分类的一件事），
 * 最底下「查看这个标签的账单」进 /tag-bills，带上这一段的起止，看到的跟这一行是同一批账；
 * 左边「改名」改的是全部时间里所有用到它的账（见 TagRenameDialog）
 */
export function BillTagList({ tags, range }: BillTagListProps) {
  const theme = useTheme();
  const [expandedTag, setExpandedTag] = useState<string | null>(null);
  const [renamingTag, setRenamingTag] = useState<string | null>(null);

  if (tags.length === 0) {
    return (
      <ThemedView type="backgroundElement" style={styles.emptyCard}>
        <ThemedText type="small" themeColor="textSecondary">
          这一段时间里没有用过标签。标签适合圈「一趟旅行」「一次装修」这种跨分类的事——
          记账时在底部那一行点「标签」就能加。
        </ThemedText>
      </ThemedView>
    );
  }

  const openBills = (tag: string) =>
    router.push({
      pathname: '/tag-bills',
      params: {
        tag,
        ...(range.start ? { from: formatDayKey(range.start) } : null),
        ...(range.end ? { to: formatDayKey(range.end) } : null),
      },
    });

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      {tags.map((tag, index) => {
        const isExpanded = expandedTag === tag.tag;
        return (
          <View key={tag.tag}>
            {index > 0 ? <View style={[styles.divider, { backgroundColor: theme.divider }]} /> : null}

            <Pressable
              onPress={() => setExpandedTag(isExpanded ? null : tag.tag)}
              accessibilityRole="button"
              accessibilityState={{ expanded: isExpanded }}
              style={styles.row}>
              <View style={styles.body}>
                <View style={styles.titleRow}>
                  <ThemedText style={styles.name} numberOfLines={1}>
                    {tag.tag}
                  </ThemedText>
                  <ThemedText style={styles.value}>{formatCurrency(tag.total)}</ThemedText>
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={14}
                    color={theme.textSecondary}
                  />
                </View>

                <PaceBar
                  percentage={tag.relative}
                  height={6}
                  color={theme.cardHighlight}
                  trackColor={theme.backgroundSelected}
                  markerColor={theme.cardHighlight}
                />

                <ThemedText themeColor="textSecondary" style={styles.meta}>
                  {tag.count} 笔 · {tag.percentage.toFixed(1)}%
                </ThemedText>
              </View>
            </Pressable>

            {isExpanded ? (
              <View style={[styles.breakdown, { backgroundColor: theme.background }]}>
                {tag.categories.map((cat) => (
                  <View key={cat.key} style={styles.catRow}>
                    {/* 定宽一格：各图标的实际宽度不一样，不定宽的话名字起点不齐 */}
                    <View style={styles.catIcon}>
                      <CategoryIcon icon={cat.icon} size={18} />
                    </View>
                    <ThemedText type="small" style={styles.catName} numberOfLines={1}>
                      {cat.name}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatCurrency(cat.total)} · {Math.round(cat.percentage)}%
                    </ThemedText>
                  </View>
                ))}
                <View style={styles.actions}>
                  <Pressable onPress={() => setRenamingTag(tag.tag)} hitSlop={6} style={styles.action}>
                    <Ionicons name="create-outline" size={14} color={theme.textSecondary} />
                    <ThemedText type="small" themeColor="textSecondary">
                      改名
                    </ThemedText>
                  </Pressable>
                  <Pressable onPress={() => openBills(tag.tag)} hitSlop={6} style={styles.action}>
                    <ThemedText type="small" style={[styles.viewAllText, { color: theme.cardHighlight }]}>
                      查看这 {tag.count} 笔账单
                    </ThemedText>
                    <Ionicons name="chevron-forward" size={14} color={theme.cardHighlight} />
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        );
      })}

      {renamingTag ? (
        <TagRenameDialog
          tag={renamingTag}
          existingTags={tags.map((t) => t.tag)}
          onDismiss={() => setRenamingTag(null)}
          onRenamed={(_, to) => {
            setRenamingTag(null);
            // 改完那一行的名字变了，展开状态跟着新名字走，不然刚改完就收起来，看不到结果
            setExpandedTag(to);
          }}
        />
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  emptyCard: {
    borderRadius: 16,
    padding: 16,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  row: {
    paddingVertical: 12,
  },
  body: {
    gap: 5,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  value: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  meta: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
  },
  // 展开区铺页面底色，读起来是"这一行底下垂下来的一块"，不是又一行标签
  breakdown: {
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  catIcon: {
    width: 24,
    alignItems: 'center',
  },
  catName: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  viewAllText: {
    fontWeight: '600',
  },
});
