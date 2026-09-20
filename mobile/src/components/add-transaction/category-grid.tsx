import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CategoryIcon } from '@/components/category/category-icon';
import { ModalBackdrop } from '@/components/ui/modal-backdrop';
import { ModalHost } from '@/components/ui/modal-host';
import { ThemedText } from '@/components/ui/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type CategoryGridItem = {
  id: string;
  name: string;
  /** 原样传库里 categories.icon 的值，怎么渲染由 CategoryIcon 决定 */
  icon: string | null;
  /** null = 一级分类；有值 = 挂在那个一级分类下面的二级分类 */
  parentId: string | null;
};

type CategoryGridProps = {
  /** 一级二级混在一起传进来，分组由这个组件自己做——调用方不必知道有几层 */
  categories: CategoryGridItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** 末位「设置」格子点了做什么。不传就不画这个格子 */
  onSettingsPress?: () => void;
};

// 一格的高度写死。二级面板要浮在被点那一行的正下方，行高必须是确定的数才算得出位置
const ITEM_HEIGHT = 72;
/** 图标本身的边长，网格和二级面板共用 */
const ICON_SIZE = 28;
/** 选中时垫在图标后面那个圆的直径 */
const CIRCLE_SIZE = 48;
const ROW_GAP = Spacing.three;
const COLUMNS = 5;
const ARROW_SIZE = 8;

/** 面板在窗口里的落点，由被点那一格反算出来 */
type PanelAnchor = { parentId: string; top: number; left: number; width: number; arrowLeft: number };

// 「设置」那一格的齿轮。走 require 而不是 CategoryIcon：它不是分类，
// 库里没有对应的行，也就没有 icon 字段可读
const SETTINGS_ICON = require('../../../assets/categories/setting.png');

// 分类网格，纯受控组件——categories 列表、选中态都由调用方传入，不关心数据是 mock 还是真实分类。
//
// 「设置」固定排在最后一格，而不是做成页面右上角的按钮：
// 想改分类的念头几乎只在"扫了一遍网格没找到合适的分类"时冒出来，
// 那一刻用户的视线正停在网格末尾，入口就该在那里。
export function CategoryGrid({ categories, selectedId, onSelect, onSettingsPress }: CategoryGridProps) {
  const gridRef = useRef<View>(null);
  // 一次只开一个：同时开两个就没法回答"我现在在选哪一类的子项"
  const [anchor, setAnchor] = useState<PanelAnchor | null>(null);

  const { parents, childrenOf } = useMemo(() => groupByParent(categories), [categories]);

  /**
   * 量出网格在**窗口坐标系**里的位置，再按行列算出面板该落在哪。
   *
   * 必须量而不能用相对定位：面板是一个独立的 Modal（见下面 ModalHost 那段），
   * 它跟网格不在同一棵视图树里，只认窗口坐标。
   */
  const openPanel = (parentId: string, index: number) => {
    gridRef.current?.measureInWindow((x, y, width) => {
      const row = Math.floor(index / COLUMNS);
      const column = index % COLUMNS;
      const columnWidth = width / COLUMNS;
      setAnchor({
        parentId,
        top: y + (row + 1) * (ITEM_HEIGHT + ROW_GAP) - ROW_GAP / 2,
        left: x,
        width,
        // 小三角对准被点那一格的中线，回答"这是谁的子分类"
        arrowLeft: (column + 0.5) * columnWidth - ARROW_SIZE,
      });
    });
  };

  const expanded = anchor ? parents.find((p) => p.id === anchor.parentId) : undefined;

  const cells: ReactNode[] = parents.map((parent, index) => {
    const children = childrenOf.get(parent.id) ?? [];
    // 选中的可能是它自己，也可能是它的某个子分类——两种都要让这一格亮起来，
    // 否则选完子分类回到网格会看不出选过哪一类
    const selectedChild = children.find((c) => c.id === selectedId) ?? null;

    return (
      <IconCell
        key={parent.id}
        icon={<CategoryIcon icon={selectedChild?.icon ?? parent.icon} size={ICON_SIZE} />}
        label={selectedChild ? parent.name + '·' + selectedChild.name : parent.name}
        selected={parent.id === selectedId || selectedChild !== null}
        hasChildren={children.length > 0}
        onPress={() => (children.length > 0 ? openPanel(parent.id, index) : onSelect(parent.id))}
      />
    );
  });

  if (onSettingsPress) {
    cells.push(
      <IconCell
        key="__settings"
        icon={<Image source={SETTINGS_ICON} style={styles.settingsIcon} contentFit="contain" />}
        label="设置"
        // 它永远不会亮起来，这就是它跟真正的分类的区别
        selected={false}
        onPress={onSettingsPress}
      />,
    );
  }

  return (
    <View ref={gridRef} style={styles.grid}>
      {toRows(cells)}

      {anchor && expanded ? (
        <SubcategoryPanel
          anchor={anchor}
          parent={expanded}
          options={childrenOf.get(expanded.id) ?? []}
          selectedId={selectedId}
          onSelect={(id) => {
            onSelect(id);
            setAnchor(null);
          }}
          onDismiss={() => setAnchor(null)}
        />
      ) : null}
    </View>
  );
}

type SubcategoryPanelProps = {
  anchor: PanelAnchor;
  parent: CategoryGridItem;
  options: CategoryGridItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDismiss: () => void;
};

/**
 * 二级分类面板。用 ModalHost 而不是在网格里绝对定位，是因为它要能**盖住分类卡以外的东西**
 * ——金额、标签那一行、甚至一部分键盘。绝对定位的子元素超出父容器在 Android 上会被裁掉，
 * 而 Modal 是独立的原生窗口，天生盖在所有内容之上。
 *
 * 背景铺一层淡遮罩（跟首页详情层同一个 ModalBackdrop）：面板本身没有底色以外的边界，
 * 不压一点的话它跟底下的网格分不开。点遮罩 = 选中这个一级分类，不是什么都不选——
 * 「点开餐饮，看了一圈没有合适的子项」的结论就是"那就记餐饮"，让它白点一下不合理。
 */
function SubcategoryPanel({ anchor, parent, options, selectedId, onSelect, onDismiss }: SubcategoryPanelProps) {
  const theme = useTheme();

  // 第一格放父分类自己：否则有子分类的一级分类永远选不中，
  // 而"就想记一笔餐饮、懒得细分到晚餐"是个正常需求
  const entries = [parent, ...options];

  return (
    <ModalHost visible animation="fade" onRequestClose={onDismiss}>
      {/* 点面板外面 = 选中这个一级分类。铺满整屏，用户不用精确点到某个空隙 */}
      <ModalBackdrop onPress={() => onSelect(parent.id)} />

      <View style={[styles.panelWrap, { top: anchor.top, left: anchor.left, width: anchor.width }]}>
        <View style={[styles.arrow, { left: anchor.arrowLeft, borderBottomColor: theme.backgroundElement }]} />
        <View style={[styles.panel, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}>
          {toRows(
            entries.map((entry) => (
              <IconCell
                key={entry.id}
                icon={<CategoryIcon icon={entry.icon} size={ICON_SIZE} />}
                label={entry.name}
                selected={entry.id === selectedId}
                onPress={() => onSelect(entry.id)}
              />
            )),
          )}
        </View>
      </View>
    </ModalHost>
  );
}

type IconCellProps = {
  icon: ReactNode;
  label: string;
  selected: boolean;
  hasChildren?: boolean;
  onPress: () => void;
};

// 选中的圆必须是独立的空 View：Android 上带圆角的容器只要有子元素溢出边界
// （就是右下角那颗 -2 的点），圆角会失效变方块——A/B 实测过，别挪回容器上
function IconCell({ icon, label, selected, hasChildren, onPress }: IconCellProps) {
  const theme = useTheme();

  return (
    <Pressable onPress={onPress} style={styles.item}>
      <View style={styles.iconSlot}>
        {selected ? <View style={[styles.circle, { backgroundColor: theme.backgroundSelected }]} /> : null}
        {icon}
        {/* 右下角那颗点：告诉用户这一格点下去是展开、不是直接选中。
            没有它，"有的格子点了会弹面板、有的不会"就变成要靠记忆的规则 */}
        {hasChildren ? (
          <View style={[styles.childDot, { backgroundColor: theme.backgroundSelected }]}>
            <Ionicons name="ellipsis-horizontal" size={10} color={theme.textSecondary} />
          </View>
        ) : null}
      </View>
      <ThemedText
        type="small"
        themeColor={selected ? undefined : 'textSecondary'}
        style={selected ? { color: theme.cardHighlight } : undefined}
        numberOfLines={1}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

/**
 * 切成一行 COLUMNS 个，每行是一个真的 row、每格 flex: 1。
 *
 * 不用 flexWrap + width: '20%'：1/5 在某些屏宽上除不尽，每格四舍五入到整数像素之后
 * 5 格加起来会超过容器宽度，第 5 格被挤到下一行——表现就是"一行只剩 4 个"。
 * 日历那边 1/7 踩过同一个坑。flex 分的是剩余像素，不存在舍入溢出。
 */
function toRows(cells: ReactNode[]): ReactNode[] {
  const rows: ReactNode[] = [];
  for (let i = 0; i < cells.length; i += COLUMNS) {
    const row = cells.slice(i, i + COLUMNS);
    // 补齐最后一行：不补的话那行只有两三格，flex: 1 会把它们摊开占满整行
    const padding = Array.from({ length: COLUMNS - row.length }, (_, k) => (
      <View key={`__pad${k}`} style={styles.item} />
    ));
    rows.push(
      <View key={i} style={styles.row}>
        {row}
        {padding}
      </View>,
    );
  }
  return rows;
}

function groupByParent(categories: CategoryGridItem[]) {
  const parents = categories.filter((c) => !c.parentId);
  const childrenOf = new Map<string, CategoryGridItem[]>();
  for (const category of categories) {
    if (!category.parentId) continue;
    const bucket = childrenOf.get(category.parentId);
    if (bucket) bucket.push(category);
    else childrenOf.set(category.parentId, [category]);
  }
  return { parents, childrenOf };
}

const styles = StyleSheet.create({
  grid: {
    rowGap: ROW_GAP,
  },
  row: {
    flexDirection: 'row',
  },
  item: {
    flex: 1,
    height: ITEM_HEIGHT,
    alignItems: 'center',
    gap: Spacing.one,
  },
  // 图标、选中圆、右下角那颗点三者共同的定位参照。自己不画任何东西，也不能有 borderRadius
  iconSlot: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
  },
  settingsIcon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
  },
  childDot: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelWrap: {
    position: 'absolute',
  },
  // 纯 CSS 三角：上下左右四条边里只给底边上色，其余透明
  arrow: {
    width: 0,
    height: 0,
    borderLeftWidth: ARROW_SIZE,
    borderRightWidth: ARROW_SIZE,
    borderBottomWidth: ARROW_SIZE,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderStyle: 'solid',
  },
  panel: {
    rowGap: ROW_GAP,
    paddingVertical: Spacing.three,
    borderRadius: 16,
    borderWidth: 1,
    // 浮起来的层要有阴影，否则跟底下糊成一片，看不出这是盖在上面的一层
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
});
