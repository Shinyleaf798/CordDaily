import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type TextStyle } from 'react-native';

import { FontSheet } from '@/components/settings/font-sheet';
import { ThemedText } from '@/components/ui/themed-text';
import { FontLabels } from '@/constants/font';
import { Colors, ScreenBottomInset, ThemeLabels, ThemeNames } from '@/constants/theme';
import { useAccounts } from '@/hooks/use-accounts';
import { useAvatar } from '@/hooks/use-avatar';
import { useLocalStats } from '@/hooks/use-backup';
import { useOverallBudget } from '@/hooks/use-budgets';
import { useCategories } from '@/hooks/use-categories';
import { useHasRemote } from '@/hooks/use-cloud';
import { useEnabledCurrencies } from '@/hooks/use-currencies';
import { FOOTPRINT_WEEKS, useEntryFootprint } from '@/hooks/use-entry-footprint';
import { useIdentity } from '@/hooks/use-identity';
import { useRecurringRules } from '@/hooks/use-recurring';
import { useTheme } from '@/hooks/use-theme';
import { useFontStore } from '@/store/font.store';
import { useThemeStore } from '@/store/theme.store';
import { formatDayLabel } from '@/utils/date';
import { formatAmount } from '@/utils/format';

type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * 内容离屏幕左右边缘多远。比别的 tab 页的 ScreenPadding（8）宽得多：
 * 那几页是卡片，卡片自己有 16~20 的内距，外面只需要再留一点；这一页没有卡片，
 * 文字直接铺在页面上，20 才是文字到屏幕边的距离
 */
const GUTTER = 20;

/**
 * 大数字用等宽数字，让上下几格的数竖着对得齐。字体本身不在这里定：
 * 原来这里写死了 Android 窄体，结果「我的」和首页的数字长得不一样；
 * 现在跟全 App 一起走「字体」里选的那套（见 constants/font）
 */
const NUMBER_FONT: TextStyle = {
  fontVariant: ['tabular-nums'],
};

/**
 * '#d4af37' + 0.4 → '#d4af3766'。足迹格子的深浅、头像底色都是同一个强调色调透明度，
 * 三套主题各自的强调色直接就能用，不用另配一套色阶
 */
function withAlpha(hex: string, alpha: number): string {
  const byte = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
  return `${hex.slice(0, 7)}${byte.toString(16).padStart(2, '0')}`;
}

/**
 * 「我的」页。这一页本来就是这本账的封面，所以从上到下是：
 *
 * 1. 这是谁的账本
 * 2. **记账足迹**——最近半年每天一格，记得越多越亮，加上「今年记了几天 · 连续几天」。
 *    改版前这里是一张头像卡 + 一张图标宫格，打开"我的"看到的全是设置；这里先看到的是自己的记账习惯
 *    （改版前那套曾经作为「经典」样式跟它并存过一阵，后来整个拿掉了，见 DECISIONS.md）
 * 3. 备份状态（还有几笔没备份）——这个数是用户唯一的安全绳，必须在外面，不能收进二级页
 * 4. 账本四格：分类 / 账户 / 预算 / 周期记账，**每格是一个大数字**而不是一个图标——
 *    会让人点进去的是"预算还剩多少""下次哪天扣"这种状态，不是图标本身
 * 5. 主题直接点色块切换，不用再进一层
 * 6. 汇率 / 云端 / 关于三格
 */
export function MePage({ onOpenAccount }: { onOpenAccount: () => void }) {
  const theme = useTheme();
  const identity = useIdentity();
  const { data: avatarUri } = useAvatar();
  const { data: hasRemote } = useHasRemote();
  const { data: stats } = useLocalStats();
  const { data: footprint } = useEntryFootprint();
  const { data: expenseCategories } = useCategories('EXPENSE');
  const { data: incomeCategories } = useCategories('INCOME');
  const { data: accounts } = useAccounts();
  const { data: budget } = useOverallBudget();
  const { data: rules } = useRecurringRules();
  const { data: currencies } = useEnabledCurrencies();
  const themeName = useThemeStore((s) => s.themeName);
  const setThemeName = useThemeStore((s) => s.setThemeName);
  const fontName = useFontStore((s) => s.fontName);
  const [isPickingFont, setPickingFont] = useState(false);

  const name = identity?.email?.split('@')[0] ?? '本地';
  const unsynced = stats?.unsyncedTotal ?? 0;
  const expenseCount = (expenseCategories ?? []).filter((c) => c.isActive === 1).length;
  const incomeCount = (incomeCategories ?? []).filter((c) => c.isActive === 1).length;
  const activeRules = (rules ?? []).filter((rule) => rule.isActive);
  const nextRule = activeRules[0];
  const foreignCount = currencies?.foreign.length ?? 0;
  const hairline = { borderColor: theme.divider };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Pressable onPress={onOpenAccount} style={styles.profile}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={[styles.avatar, { backgroundColor: withAlpha(theme.cardHighlight, 0.18) }]}>
            <ThemedText style={[styles.avatarText, { color: theme.cardHighlight }]}>
              {name[0]?.toUpperCase() ?? '·'}
            </ThemedText>
          </View>
        )}
        <View style={styles.grow}>
          <ThemedText style={styles.name}>{name}的账本</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {hasRemote ? (identity ? '已登录 · 云端已连接' : '云端已连接 · 还没登录') : '只存在这台手机上'}
          </ThemedText>
        </View>
        <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
      </Pressable>

      <View style={styles.footprint}>
        <View style={styles.footprintHead}>
          <ThemedText type="small" themeColor="textSecondary">
            今年记了
          </ThemedText>
          <ThemedText style={[NUMBER_FONT, styles.footprintNumber, { color: theme.cardHighlight }]}>
            {footprint?.daysThisYear ?? 0}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            天 · 连续{' '}
            <ThemedText style={[NUMBER_FONT, styles.streak]}>{footprint?.streak ?? 0}</ThemedText> 天
          </ThemedText>
        </View>
        <Footprint cells={footprint?.cells ?? []} maxCount={footprint?.maxCount ?? 0} />
        <View style={styles.footprintAxis}>
          <ThemedText type="small" themeColor="textSecondary">
            半年前
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            今天
          </ThemedText>
        </View>
      </View>

      {/* 备份 → 账本四格 → 主题 → 三格，四段之间只有细线，所以包在一起、不吃外层的 gap */}
      <View>
        <View style={[styles.backup, hairline]}>
          <View style={styles.grow}>
            <ThemedText>
              {unsynced > 0 ? (
                <>
                  <ThemedText style={[NUMBER_FONT, { color: theme.cardHighlight, fontWeight: '700' }]}>
                    {unsynced}
                  </ThemedText>{' '}
                  笔还没备份
                </>
              ) : (
                '全部已备份'
              )}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              备份到云端、导出成文件、从备份恢复
            </ThemedText>
          </View>
          <Pressable onPress={() => router.push('/settings/backup')} hitSlop={6} style={styles.backupSecondary}>
            <ThemedText type="small" themeColor="textSecondary">
              恢复
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => router.push('/settings/backup')}
            style={[styles.backupButton, { backgroundColor: theme.cardHighlight }]}>
            <ThemedText type="small" style={{ color: theme.onCardHighlight, fontWeight: '700' }}>
              备份
            </ThemedText>
          </Pressable>
        </View>

        <View style={styles.statGrid}>
          <StatCell
            icon="grid-outline"
            label="分类"
            value={String(expenseCount + incomeCount)}
            unit="个"
            hint={`支出 ${expenseCount} · 收入 ${incomeCount}`}
            href="/categories"
            position="topLeft"
          />
          <StatCell
            icon="card-outline"
            label="账户"
            value={String(accounts?.length ?? 0)}
            unit="个"
            hint="记账时选「用什么付的」"
            href="/accounts"
            position="topRight"
          />
          <StatCell
            icon="cash-outline"
            label="每月预算"
            // 预算几乎都是整数，「3,500.00」的 .00 在大字里只是噪音
            value={budget ? formatAmount(budget).replace(/\.00$/, '') : '未设'}
            unit={budget ? 'RM' : ''}
            hint={budget ? '首页按它算还剩多少' : '设一个，首页就能算节奏'}
            href="/set-budget"
            position="bottomLeft"
          />
          <StatCell
            icon="repeat-outline"
            label="周期记账"
            value={String(activeRules.length)}
            unit="条"
            hint={nextRule ? `下次 ${formatDayLabel(new Date(nextRule.nextRunDate))}` : '记账时点「重复」添加'}
            href="/recurring"
            position="bottomRight"
          />
        </View>

        <View style={[styles.themeRow, hairline]}>
          <Ionicons name="color-palette-outline" size={20} color={theme.text} />
          <ThemedText style={styles.grow}>主题</ThemedText>
          {ThemeNames.map((option) => {
            const palette = Colors[option];
            const selected = option === themeName;
            return (
              <Pressable
                key={option}
                onPress={() => setThemeName(option)}
                accessibilityRole="button"
                accessibilityLabel={`${ThemeLabels[option]}${selected ? '（当前）' : ''}`}
                style={styles.swatchSlot}>
                <View
                  style={[
                    styles.swatch,
                    {
                      backgroundColor: palette.background,
                      borderColor: selected ? theme.cardHighlight : theme.backgroundSelected,
                    },
                  ]}>
                  <View style={[styles.swatchDot, { backgroundColor: palette.cardHighlight }]} />
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* 字体跟主题挨着：两样都是「整个 App 长什么样」，用户会在同一处找 */}
        <Pressable onPress={() => setPickingFont(true)} style={[styles.themeRow, hairline]}>
          <Ionicons name="text-outline" size={20} color={theme.text} />
          <ThemedText style={styles.grow}>字体</ThemedText>
          <ThemedText style={[NUMBER_FONT, { color: theme.cardHighlight, fontWeight: '700' }]}>1,234.50</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {FontLabels[fontName]}
          </ThemedText>
          <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
        </Pressable>

        <View style={[styles.tools, hairline]}>
          <ToolCell
            icon="swap-horizontal-outline"
            label="货币汇率"
            status={foreignCount > 0 ? `${foreignCount} 种外币` : '只用 MYR'}
            href="/settings/currency"
          />
          <ToolCell
            icon="server-outline"
            label="云端连接"
            status={hasRemote ? '已连接' : '未连接'}
            href="/settings/cloud"
            divider
          />
          <ToolCell
            icon="information-circle-outline"
            label="关于"
            status="版本与说明"
            href="/settings/about"
            divider
          />
        </View>
      </View>

      {isPickingFont ? <FontSheet onDismiss={() => setPickingFont(false)} /> : null}
    </ScrollView>
  );
}

/**
 * 足迹格子：一列一周、周日在最上面，最右边一列是本周。深浅按"这天记了几笔 / 最多那天"分四档，
 * 用主题强调色的透明度表达，三套主题都成立
 */
function Footprint({ cells, maxCount }: { cells: ({ key: string; count: number } | null)[]; maxCount: number }) {
  const theme = useTheme();
  const columns = Array.from({ length: FOOTPRINT_WEEKS }, (_, week) => cells.slice(week * 7, week * 7 + 7));

  return (
    <View style={styles.footprintGrid} accessibilityLabel="最近半年每天的记账笔数，越亮记得越多">
      {columns.map((column, i) => (
        <View key={i} style={styles.footprintColumn}>
          {column.map((cell, j) => {
            const ratio = cell && maxCount > 0 ? cell.count / maxCount : 0;
            const backgroundColor = !cell
              ? 'transparent'
              : cell.count === 0
                ? theme.backgroundElement
                : withAlpha(theme.cardHighlight, ratio < 0.25 ? 0.3 : ratio < 0.5 ? 0.5 : ratio < 0.8 ? 0.75 : 1);
            return <View key={cell?.key ?? `future-${j}`} style={[styles.footprintCell, { backgroundColor }]} />;
          })}
        </View>
      ))}
    </View>
  );
}

type StatCellProps = {
  icon: IconName;
  label: string;
  value: string;
  unit: string;
  hint: string;
  href: Href;
  position: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';
};

/** 账本四格之一：小图标 + 标签，下面一个大数字，再下面一行状态。格子之间只用细线分，不做成卡片 */
function StatCell({ icon, label, value, unit, hint, href, position }: StatCellProps) {
  const theme = useTheme();
  const isLeft = position === 'topLeft' || position === 'bottomLeft';
  return (
    <Pressable
      onPress={() => router.push(href)}
      style={({ pressed }) => [
        styles.statCell,
        {
          borderColor: theme.divider,
          borderRightWidth: isLeft ? StyleSheet.hairlineWidth : 0,
          paddingLeft: isLeft ? 0 : 16,
          paddingRight: isLeft ? 16 : 0,
          opacity: pressed ? 0.6 : 1,
        },
      ]}>
      <View style={styles.statLabel}>
        <Ionicons name={icon} size={16} color={theme.cardHighlight} />
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
      </View>
      <View style={styles.statValueRow}>
        <ThemedText style={[NUMBER_FONT, styles.statValue]} numberOfLines={1}>
          {value}
        </ThemedText>
        {unit ? (
          <ThemedText type="small" themeColor="textSecondary">
            {unit}
          </ThemedText>
        ) : null}
      </View>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        {hint}
      </ThemedText>
    </Pressable>
  );
}

function ToolCell({
  icon,
  label,
  status,
  href,
  divider,
}: {
  icon: IconName;
  label: string;
  status: string;
  href: Href;
  divider?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => router.push(href)}
      style={({ pressed }) => [
        styles.toolCell,
        divider ? { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: theme.divider, paddingLeft: 14 } : null,
        { opacity: pressed ? 0.6 : 1 },
      ]}>
      <Ionicons name={icon} size={20} color={theme.text} />
      <ThemedText style={styles.toolLabel}>{label}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        {status}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 8,
    // 底部留出 tab bar 中间那颗凸起的 ＋ 的位置，跟另外几个 tab 页同一个数
    paddingBottom: ScreenBottomInset,
    gap: 18,
  },
  grow: {
    flex: 1,
  },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: GUTTER,
    minHeight: 52,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
  },
  name: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '700',
  },
  footprint: {
    paddingHorizontal: GUTTER,
    gap: 10,
  },
  footprintHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  footprintNumber: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
  },
  streak: {
    fontSize: 15,
  },
  footprintGrid: {
    flexDirection: 'row',
    gap: 3,
  },
  footprintColumn: {
    flex: 1,
    gap: 3,
  },
  footprintCell: {
    aspectRatio: 1,
    borderRadius: 2,
  },
  footprintAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  backup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: GUTTER,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backupSecondary: {
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  backupButton: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 18,
    justifyContent: 'center',
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: GUTTER,
  },
  statCell: {
    width: '50%',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  statLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginTop: 4,
  },
  statValue: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
  },
  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: GUTTER,
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  swatchSlot: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  tools: {
    flexDirection: 'row',
    marginHorizontal: GUTTER,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toolCell: {
    flex: 1,
    paddingVertical: 12,
    gap: 4,
    minHeight: 44,
  },
  toolLabel: {
    fontSize: 14,
    marginTop: 2,
  },
});
