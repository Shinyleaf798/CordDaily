import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { ThemedText } from '@/components/ui/themed-text';
import { ScreenPadding } from '@/constants/theme';
import { BillScopeLabels, type BillScope } from '@/hooks/use-bill-overview-data';
import { useTheme } from '@/hooks/use-theme';

const SCOPE_ITEMS = (['all', 'year', 'month', 'week'] as const).map((key) => ({
  key,
  label: BillScopeLabels[key],
}));

type BillHeaderProps = {
  scope: BillScope;
  onScopeChange: (scope: BillScope) => void;
  onBack: () => void;
  /** 汇总表的明细行是不是正序。图标只换方向，不换形状 */
  sortAscending: boolean;
  onToggleSort: () => void;

  /** 全部账单 / 2026年 / 2026年9月 / 9月22日 - 9月28日 */
  periodLabel: string;
  /** 「总」那一档没有前后可翻，两颗圆钮不画 */
  canStep: boolean;
  onStep: (delta: number) => void;
  /** 漏斗当前有没有在过滤。有的话图标点亮 */
  isFiltered: boolean;
  onOpenFilter: () => void;
};

/**
 * 账单预览页顶上那两行：粒度切换 + 正在看哪一段。
 *
 * **导航栏整条关掉，这两行自己画**（路由那边 `headerShown: false`）：
 * 系统导航栏的中间只放得下一个标题，而这一页最该占住那个位置的是 总/年/月/周 那排控件——
 * 它是这一页的主操作，一进来手就该能够到。标题退到第二行，跟翻页的箭头并排。
 *
 * 两行分开而不是挤成一行：它们回答的是两个不同的问题——
 * 「按什么粒度看」是个模式选择（选了就不常动），「看哪一段」是个会被反复拨动的游标。
 * 挤在一行里，左右箭头会紧挨着分段控件，手指很容易点到那个更贵的（换粒度会重置到现在）。
 *
 * 「总」那一档两颗翻页圆钮整个不画，而不是置灰：那一档本来就只有一段，
 * 灰着的按钮是在暗示"这里有东西只是现在不能用"，而这里是"这里没有这回事"。
 * 那一档的第二行因此只剩正中间的「全部账单」——它同时就是这一页的名字。
 *
 * 分段控件传了轨道/滑块颜色：默认那套"浅轨道 + 深滑块"是给铺在卡片上的用法准备的
 * （收支切换），在这一页会变成一条看不见的轨道配一块更黑的滑块。
 * 轨道走 `backgroundSelected`、滑块走 `tabTrackBackground`——**比它脚下那层各高一级**。
 * 这一排原来铺在页面底色上，轨道因此取的是 `backgroundElement`；这条 bar 现在自己就是
 * `backgroundElement` 了，轨道再用它就等于没有轨道，所以整组往上挪了一级。
 */
export function BillHeader({
  scope,
  onScopeChange,
  onBack,
  sortAscending,
  onToggleSort,
  periodLabel,
  canStep,
  onStep,
  isFiltered,
  onOpenFilter,
}: BillHeaderProps) {
  const theme = useTheme();

  return (
    <View style={[styles.wrap, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.topRow}>
        <Pressable onPress={onBack} hitSlop={10} style={styles.edgeButton}>
          <Ionicons name="chevron-back" size={26} color={theme.text} />
        </Pressable>

        <View style={styles.scopeSlot}>
          <SegmentedTabs
            items={SCOPE_ITEMS}
            value={scope}
            onChange={onScopeChange}
            trackColor={theme.backgroundSelected}
            thumbColor={theme.tabTrackBackground}
          />
        </View>

        {/* 排序只换一个方向，所以用同一个图标的两种朝向，不换成两个不同的图标——
            图标一换，人会以为按下去做的是另一件事 */}
        <Pressable onPress={onToggleSort} hitSlop={10} style={styles.edgeButton}>
          <Ionicons
            name={sortAscending ? 'arrow-up' : 'swap-vertical'}
            size={22}
            color={sortAscending ? theme.cardHighlight : theme.text}
          />
        </Pressable>
      </View>

      <View style={styles.titleRow}>
        {canStep ? (
          <Pressable onPress={() => onStep(-1)} hitSlop={10}>
            <View style={[styles.stepCircle, { backgroundColor: theme.backgroundSelected }]}>
              <Ionicons name="chevron-back" size={15} color={theme.text} />
            </View>
          </Pressable>
        ) : null}

        <ThemedText style={styles.periodLabel} numberOfLines={1}>
          {periodLabel}
        </ThemedText>

        {canStep ? (
          <Pressable onPress={() => onStep(1)} hitSlop={10}>
            <View style={[styles.stepCircle, { backgroundColor: theme.backgroundSelected }]}>
              <Ionicons name="chevron-forward" size={15} color={theme.text} />
            </View>
          </Pressable>
        ) : null}

        {/* 漏斗绝对定位在右边：它不参与中间那三个元素的居中，
            否则「2026年」会因为右边多一个图标而偏左 */}
        <Pressable onPress={onOpenFilter} hitSlop={10} style={styles.filterButton}>
          <Ionicons
            name={isFiltered ? 'funnel' : 'funnel-outline'}
            size={20}
            color={isFiltered ? theme.cardHighlight : theme.text}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // 底色跟记一笔那页的系统导航栏同一个 token（`_layout` 里 navigationTheme.card
  // = backgroundElement）：这两页顶上那条是同一类东西——「不会滚走的框」，
  // 所以用同一个色。铺满整宽靠的是它直接挂在 SafeAreaView 下面，不用负 margin。
  //
  // paddingBottom 必须有：第二行（翻页 + 期间标签）不能贴着色块下沿，
  // 否则这条 bar 看着像被切掉了半行
  wrap: {
    paddingHorizontal: ScreenPadding,
    paddingTop: 4,
    paddingBottom: 10,
    gap: 14,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // 分段控件占中间全部剩余宽度，两边的按钮各自固定宽——
  // 这样它的中点就是这一行的中点，不用去算
  scopeSlot: {
    flex: 1,
  },
  edgeButton: {
    width: 32,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingBottom: 10,
  },
  // 圆钮用主题里的选中底色 + 正文色箭头，不照抄参考界面那个白底黑箭头：
  // 那一套在黑色主题下成立，换到白色主题就是一枚黑坨坨，比周围任何东西都重
  stepCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodLabel: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '700',
  },
  filterButton: {
    position: 'absolute',
    right: 0,
    height: 30,
    justifyContent: 'center',
  },
});
