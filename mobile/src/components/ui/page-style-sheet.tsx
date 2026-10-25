import type { ComponentType, ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ModalHost } from '@/components/ui/modal-host';
import { ModalSheet, useSheetTransition } from '@/components/ui/modal-sheet';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** 第一层里的一个整页选项：名字、一句说明、一张缩略图 */
export type StyleChoice<K extends string> = {
  key: K;
  label: string;
  hint: string;
  Thumbnail: ComponentType;
};

type PageStyleSheetProps<K extends string> = {
  title: string;
  choices: StyleChoice<K>[];
  /** 现在是哪一个。`null` = 哪个都不是（首页两段拆开选成不一样时），第一层就都不亮 */
  selected: K | null;
  onSelect: (key: K) => void;
  /** 第二层「各部分显示什么」。只有真有可选项的页才传 */
  options?: ReactNode;
  onDismiss: () => void;
};

/**
 * 页面的样式弹层，由页尾那颗「编辑」（PageEditButton）打开。首页和日历共用。两层：
 * 1. **整页**：两个带缩略图的预设（首页：经典 / 金环；日历：经典 / 热力）
 * 2. **各部分显示什么**：`options` 插槽（上半、下半各自选，首页还多一个账单看多长）
 *
 * 第一层的选项和选了之后改什么都由路由页传进来，这一层只管画——不认识任何一页，所以在 ui/。
 * 原来只有首页用、放在 components/home/ 里，日历也要一份之后按 CLAUDE.md 的归类规则搬了出来。
 *
 * 选了立刻生效、弹层不关：弹层只占下半屏，用户能在上面直接看到这一页变成什么样，
 * 不满意马上点回去。关掉要么点遮罩，要么按返回。
 */
export function PageStyleSheet<K extends string>({
  title,
  choices,
  selected,
  onSelect,
  options,
  onDismiss,
}: PageStyleSheetProps<K>) {
  const theme = useTheme();
  const sheet = useSheetTransition(onDismiss, 0.85);

  return (
    <ModalHost visible animation="none" onRequestClose={() => sheet.close()}>
      <ModalSheet title={title} transition={sheet}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="small" themeColor="textSecondary">
            整页样式
          </ThemedText>
          <StyleChoiceRow choices={choices} selected={selected} onSelect={onSelect} />

          {options ? (
            <>
              <View style={[styles.divider, { backgroundColor: theme.divider }]} />
              <ThemedText type="small" themeColor="textSecondary">
                各部分显示什么
              </ThemedText>
              {options}
            </>
          ) : null}

          <ThemedText type="small" themeColor="textSecondary" style={styles.footnote}>
            只换这一页的样子，账和功能都不变。改了马上生效。
          </ThemedText>
        </ScrollView>
      </ModalSheet>
    </ModalHost>
  );
}

type StyleChoiceRowProps<K extends string> = {
  choices: StyleChoice<K>[];
  selected: K | null;
  onSelect: (key: K) => void;
};

/**
 * 一排带缩略图的大选项（缩略图在左，名字和一句说明在右）。
 * 第一层「整页样式」用它；第二层里需要"看图选"的部分（首页上半、下半）也用它，
 * 两层长得一样，用户不用学第二种选法
 */
export function StyleChoiceRow<K extends string>({ choices, selected, onSelect }: StyleChoiceRowProps<K>) {
  const theme = useTheme();
  return (
    <View style={styles.styleRow}>
      {choices.map(({ key, label, hint, Thumbnail }) => {
        const isSelected = key === selected;
        return (
          <Pressable
            key={key}
            onPress={() => onSelect(key)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            style={[
              styles.styleOption,
              {
                backgroundColor: theme.background,
                borderColor: isSelected ? theme.cardHighlight : theme.backgroundSelected,
              },
            ]}>
            <Thumbnail />
            <View style={styles.styleText}>
              <ThemedText type="default" style={[styles.styleName, isSelected ? { color: theme.cardHighlight } : null]}>
                {label}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {hint}
              </ThemedText>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** 第二层里一组"看图选"的选项：一行标题 + 一排 StyleChoiceRow */
export function StyleChoiceGroup<K extends string>({
  title,
  ...row
}: StyleChoiceRowProps<K> & { title: string }) {
  return (
    <View style={styles.group}>
      <ThemedText type="default" style={styles.groupTitle}>
        {title}
      </ThemedText>
      <StyleChoiceRow {...row} />
    </View>
  );
}

type OptionGroupProps<T extends string> = {
  title: string;
  values: readonly T[];
  labels: Record<T, string>;
  selected: T;
  onSelect: (value: T) => void;
  hint?: string;
};

/**
 * 第二层里的一组胶囊（「账单看多长」这种没有图可画的选项）。
 * 跟 StyleChoiceGroup 放在一起，拼 `options` 时两种选法用的是同一套间距
 */
export function StyleOptionGroup<T extends string>({
  title,
  values,
  labels,
  selected,
  onSelect,
  hint,
}: OptionGroupProps<T>) {
  const theme = useTheme();
  return (
    <View style={styles.group}>
      <ThemedText type="default" style={styles.groupTitle}>
        {title}
      </ThemedText>
      <View style={styles.chips}>
        {values.map((value) => {
          const isSelected = value === selected;
          return (
            <Pressable
              key={value}
              onPress={() => onSelect(value)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              style={[styles.chip, { backgroundColor: isSelected ? theme.cardHighlight : theme.background }]}>
              <ThemedText
                type="small"
                style={isSelected ? { color: theme.onCardHighlight, fontWeight: '700' } : undefined}>
                {labels[value]}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
      {hint ? (
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
}

/**
 * 每张缩略图的外框（52×76，页面底色）。各页的缩略图都套这个，两页的弹层里图卡才一样大。
 * 缩略图只画骨架不画真数据：要回答的是"卡片还是通栏""横条还是圆环"，缩小的真页面反而看不清
 */
export function ThumbnailFrame({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <View style={[styles.thumbnailFrame, { backgroundColor: theme.background }]}>{children}</View>;
}

const styles = StyleSheet.create({
  thumbnailFrame: {
    width: 52,
    height: 76,
    borderRadius: 8,
    padding: 5,
    gap: 4,
  },
  content: {
    gap: Spacing.two,
    paddingBottom: Spacing.two,
  },
  styleRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  styleOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: Spacing.two,
    borderRadius: 14,
    borderWidth: 2,
  },
  styleText: {
    flex: 1,
    gap: 2,
  },
  styleName: {
    fontWeight: '700',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.two,
  },
  group: {
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  groupTitle: {
    fontWeight: '500',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footnote: {
    marginTop: Spacing.two,
  },
});
