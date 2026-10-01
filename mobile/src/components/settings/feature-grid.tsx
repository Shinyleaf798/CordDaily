import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Entry = {
  href: Href | null;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
};

/**
 * 「我的」页的功能网格。
 *
 * 它替掉了原来的「账本」和「外观」两个中转页——那两页各自只是转发三条和两条，
 * 网格把它们**整个拉平**：同样一屏，少按一次。
 *
 * 图标用普通文字色而不是主题强调色：这里有八个图标，全上金色会跟下面备份卡上的
 * 金色主按钮抢注意力。强调色留给"真正要你动手的那一个"。
 *
 * **两行各是一件事**：第一行是账本里的东西（分类、账户、预算、周期），
 * 第二行是设定（汇率、云端、主题、布局）。四列正好铺满，不留空格子——
 * 网格一旦缺角，那个缺口看起来像是坏了而不是"没有第八项"。
 *
 * 报销和标签**故意不在这里**：统计页上已经各有一个入口。同一个页面在两个地方开门，
 * 用户会以为那是两个不同的功能（这条在改版前的 settings/ledger.tsx 里就写过）。
 */
const ENTRIES: Entry[] = [
  { href: '/categories', icon: 'grid-outline', label: '分类管理' },
  { href: '/accounts', icon: 'card-outline', label: '账户' },
  { href: '/set-budget', icon: 'cash-outline', label: '预算' },
  // href 为 null = 还没做的位。压暗留着而不是删掉，是因为它在规格文档里已经是既定功能，
  // 空着能让人一眼看出"这里以后有东西"，比某天突然多出一格好
  { href: null, icon: 'repeat-outline', label: '周期记账' },

  { href: '/settings/currency', icon: 'swap-horizontal-outline', label: '货币汇率' },
  // 从下面「数据」那一组挪上来的。原来那一行带着状态（已连接 / 待登录 + 一句说明），
  // 进了网格只剩一个标签——但那份状态没丢：**紧挨着的备份卡就在说同一件事**
  // （连没连上、上次备份是什么时候、按钮是「备份」还是「去连接」），
  // 而且说得比一行 hint 更清楚。一件事在同一屏上交代两遍，留更好的那一遍
  // 这一格去的是"填 Neon 连接串"那一页，不是备份本身。原来叫「云端备份」，
  // 在「数据备份与恢复」出现之后就是两个名字抢同一件事——改叫「云端连接」，跟它实际做的事对齐
  { href: '/settings/cloud', icon: 'server-outline', label: '云端连接' },
  { href: '/settings/theme', icon: 'color-palette-outline', label: '主题' },
  { href: '/settings/home-layout', icon: 'apps-outline', label: '首页设置' },
];

export function FeatureGrid() {
  const theme = useTheme();

  return (
    <View style={[styles.grid, { backgroundColor: theme.backgroundElement }]}>
      {ENTRIES.map((entry) => (
        <Pressable
          key={entry.label}
          disabled={!entry.href}
          onPress={() => entry.href && router.push(entry.href)}
          style={[styles.cell, !entry.href && styles.disabled]}>
          <Ionicons name={entry.icon} size={24} color={theme.text} />
          <ThemedText type="small">{entry.label}</ThemedText>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: 14,
  },
  // 25% 一格，四列正好铺满一行；跟记账页的分类网格是同一种手感
  cell: {
    width: '25%',
    alignItems: 'center',
    gap: Spacing.one + 2,
  },
  disabled: { opacity: 0.4 },
});
