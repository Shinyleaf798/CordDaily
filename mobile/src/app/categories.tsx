import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Stack } from 'expo-router/js-stack';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryActionSheet, type CategoryAction } from '@/components/category/category-action-sheet';
import { CategoryEditorDialog } from '@/components/category/category-editor-dialog';
import { CategoryIcon } from '@/components/category/category-icon';
import { CategoryParentPicker } from '@/components/category/category-parent-picker';
import { TransactionTypeTabs } from '@/components/transaction/transaction-type-tabs';
import { DragSortList } from '@/components/ui/drag-sort-list';
import { DialogActions, ModalDialog } from '@/components/ui/modal-dialog';
import { ModalHost } from '@/components/ui/modal-host';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { ScreenPadding, Spacing } from '@/constants/theme';
import type { Category, CategoryType } from '@/db/categories';
import {
  useCategories,
  useCategoryTip,
  useCategoryUsage,
  useDeleteCategory,
  useMoveCategory,
  useReorderCategories,
  useSetCategoryActive,
} from '@/hooks/use-categories';
import { useTheme } from '@/hooks/use-theme';

/**
 * 一行收起时的高度。图标框是 34，所以上下各留 8 —— 再紧就压到图标了，
 * 而且这一行同时是整行的点击区，低于 44 点会不好点。
 *
 * DragSortList 拖动时按它算每一行的落点，所以这个数**必须**跟行的实际高度一致：
 * styles.header 直接用它当 height，两边不会走散。
 */
const ROW_HEIGHT = 50;
const ROW_GAP = Spacing.two;
/** 子分类网格一行几个。跟记账页那张网格同一个数，两边看到的排布才是一回事 */
const GRID_COLUMNS = 7;
/** 行首那个展开标记**占位**的宽度。没有子分类的行也留着它，整列图标才在一条线上 */
const CHEVRON_WIDTH = 18;
/**
 * 标记本身的字号，比占位宽度小：实心三角是把方框填满的字形，
 * 按 18 画出来会比同尺寸的线条箭头重得多，压过旁边的分类图标。
 */
const CHEVRON_SIZE = 13;
/**
 * 展开标记距卡片左边的距离。给它一点余量，三角才不像是贴在卡片边框上。
 * 右边的 `⋯` 不用配一个对称的内距——那个按钮自带 24 点宽、字形居中，
 * 圆点本来就落在离边 12 点的位置，跟这里的三角（8 + 18/2 = 17）已经大致对称。
 */
const ROW_EDGE = Spacing.two;
/** 图标的方框边长。父级和子级用同一个数，纯粹是为了两处的图标看着一样大 */
const ICON_BOX = 34;

/**
 * 分类管理。入口有两个：记账页分类网格最后那个「设置」格子，和「我的 → 账本 → 分类管理」。
 * 从记账页进来时带 `?type=INCOME`，省得用户刚在记账页选了收入、进来还要再切一次。
 *
 * 一屏只列一级分类，点一行展开它的子分类图标网格（一次只展开一个）。
 * 每行右边一个 `⋯`，一个分类能做的事全在那个菜单里——行上原来并排三个图标按钮，
 * 挤在一起还只放得下三件事，而且"为什么这个删除是灰的"没地方解释。
 *
 * 顺序由用户长按拖出来，决定的是**记账页网格里的先后**。
 * 只有一级分类拖得动，子分类跟着创建顺序（见 docs/PROJECT-PLAN.md 的取舍）。
 */
export default function CategoriesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string }>();
  const [type, setType] = useState<CategoryType>(params.type === 'INCOME' ? 'INCOME' : 'EXPENSE');

  const { data } = useCategories(type);
  const rows = useMemo(() => data ?? [], [data]);
  const { data: usage } = useCategoryUsage(rows.map((c) => c.id));
  const tip = useCategoryTip();

  // 一级在外、二级挂在各自父下面。分层只在这一页做，记账页的网格自己也分一次——
  // 两边要的形状不一样（这里是可折叠的分组，那边是网格 + 浮层），共用一个结构反而都别扭
  const { parents, childrenOf } = useMemo(() => groupByParent(rows), [rows]);
  const activeParents = useMemo(() => parents.filter((p) => p.isActive), [parents]);
  const inactiveParents = useMemo(() => parents.filter((p) => !p.isActive), [parents]);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // 手指一松，列表必须立刻停在新位置。乐观更新要等 onMutate 里那个 await 走完，
  // 中间隔着一帧，不接住的话列表会先弹回原样再跳过去。
  // 存 `basedOn` 是为了不用 useEffect 清理：乐观更新一落地 data 就换了个引用，
  // 这份覆盖自动失效，而那时 data 本身已经是新顺序了
  const [pendingOrder, setPendingOrder] = useState<{ basedOn: Category[]; ids: string[] } | null>(null);
  const orderedActiveIds =
    pendingOrder && pendingOrder.basedOn === data ? pendingOrder.ids : activeParents.map((p) => p.id);

  const reorder = useReorderCategories();
  const setActive = useSetCategoryActive();
  const deleteCategory = useDeleteCategory();
  const move = useMoveCategory();

  // 三个弹层都是「null = 没开」，不另外配一个 isOpen：两个 state 就可能出现
  // "开着但没数据"这种本不该存在的组合
  const [sheetFor, setSheetFor] = useState<Category | null>(null);
  const [editor, setEditor] = useState<{ category: Category | null; parent?: Category } | null>(null);
  const [movingFor, setMovingFor] = useState<Category | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Category | null>(null);

  const byId = useMemo(() => new Map(rows.map((c) => [c.id, c])), [rows]);
  // 弹层开着的时候数据可能被别处刷新（改完名字、停用完），拿最新那份渲染，
  // 否则菜单标题还停在旧名字上
  const sheetCategory = sheetFor ? (byId.get(sheetFor.id) ?? sheetFor) : null;
  const movingCategory = movingFor ? (byId.get(movingFor.id) ?? movingFor) : null;

  const handleDrop = (orderedIds: string[]) => {
    setPendingOrder({ basedOn: data ?? [], ids: orderedIds });
    reorder.mutate({ type, orderedIds });
  };

  const handleDragStateChange = (id: string | null) => {
    setDraggingId(id);
    // 拖动期间所有组收起：DragSortList 要求每行等高，而且满屏都是展开的网格时
    // 也根本看不出自己拖到第几个了
    if (id) setExpandedId(null);
  };

  const handleAction = (action: CategoryAction) => {
    const target = sheetCategory;
    setSheetFor(null);
    if (!target) return;

    switch (action) {
      case 'edit':
        setEditor({ category: target });
        break;
      case 'move':
        move.reset();
        setMovingFor(target);
        break;
      case 'bills':
        // 不带 month：那一页自己会落到当前月份，从这里进去看的就是"最近的情况"
        router.push({ pathname: '/category-spending', params: { id: target.id } });
        break;
      case 'toggleActive':
        setActive.mutate({ id: target.id, isActive: !target.isActive });
        break;
      case 'delete':
        deleteCategory.reset();
        setPendingDelete(target);
        break;
    }
  };

  // 只在成功时关对话框。失败了留在原地把 db 层抛的话显示出来——
  // 静默关掉的话用户看到分类还在，只会以为是自己没点中
  const confirmDelete = () => {
    if (!pendingDelete) return;
    deleteCategory.mutate(pendingDelete.id, { onSuccess: () => setPendingDelete(null) });
  };

  const dismissDelete = () => {
    deleteCategory.reset();
    setPendingDelete(null);
  };

  const renderGroup = (category: Category, isDragging: boolean) => (
    <CategoryGroup
      category={category}
      subcategories={childrenOf.get(category.id) ?? []}
      expanded={expandedId === category.id}
      dragging={isDragging}
      onMore={() => setSheetFor(category)}
      onChildPress={(child) => setSheetFor(child)}
      onAddChild={() => setEditor({ category: null, parent: category })}
    />
  );

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['bottom', 'left', 'right']}>
      {/* 收支切换放在导航栏里，跟记账页一个位置——两页是同一件事（在两套分类之间切），
          长在同一个地方就不用重新找。顺带把页面里那一行省下来给列表 */}
      <Stack.Screen options={{ headerTitle: () => <TransactionTypeTabs value={type} onChange={setType} /> }} />

      <ThemedView style={styles.container}>
        {/* 拖动时必须关掉滚动：手指正在拖一行，同一根手指的纵向移动不能同时喂给 ScrollView，
            否则列表一边滚一边拖，落点完全不可控 */}
        <ScrollView scrollEnabled={draggingId === null} contentContainerStyle={styles.list}>
          {tip.visible ? (
            <View style={[styles.tip, { backgroundColor: theme.backgroundElement }]}>
              <Ionicons name="bulb-outline" size={18} color={theme.cardHighlight} style={styles.tipIcon} />
              <View style={styles.tipText}>
                <ThemedText type="small" themeColor="textSecondary">
                  长按一级分类可以上下拖动，改它在记账页里的先后
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  点右边的 ⋯ 可以改名、停用、换层级
                </ThemedText>
              </View>
              <Pressable onPress={tip.dismiss} hitSlop={10} style={styles.tipClose}>
                <Ionicons name="close" size={16} color={theme.textSecondary} />
              </Pressable>
            </View>
          ) : null}

          <DragSortList
            ids={orderedActiveIds}
            rowHeight={ROW_HEIGHT}
            rowGap={ROW_GAP}
            onRowPress={(id) => setExpandedId((current) => (current === id ? null : id))}
            onDragStateChange={handleDragStateChange}
            onDrop={handleDrop}
            renderRow={(id, isDragging) => {
              const category = byId.get(id);
              return category ? renderGroup(category, isDragging) : null;
            }}
          />

          <Pressable
            onPress={() => setEditor({ category: null })}
            style={[styles.addRow, { borderColor: theme.cardHighlight }]}>
            <Ionicons name="add" size={20} color={theme.cardHighlight} />
            <ThemedText type="default" style={{ color: theme.cardHighlight }}>
              新建{type === 'EXPENSE' ? '支出' : '收入'}分类
            </ThemedText>
          </Pressable>

          {/* 停用的收在最后，不跟在用的混在一起：它们在记账页已经看不见了，
              摆在中间只会让用户以为自己没停用成功 */}
          {inactiveParents.length > 0 ? (
            <View style={styles.inactiveSection}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
                已停用 · {inactiveParents.length}
              </ThemedText>
              {inactiveParents.map((category) => (
                <Pressable
                  key={category.id}
                  onPress={() => setExpandedId((current) => (current === category.id ? null : category.id))}
                  style={styles.inactiveRow}>
                  {renderGroup(category, false)}
                </Pressable>
              ))}
            </View>
          ) : null}
        </ScrollView>
      </ThemedView>

      {sheetCategory ? (
        <CategoryActionSheet
          category={sheetCategory}
          childCount={(childrenOf.get(sheetCategory.id) ?? []).length}
          usage={usage?.[sheetCategory.id] ?? 0}
          onSelect={handleAction}
          onDismiss={() => setSheetFor(null)}
        />
      ) : null}

      {/* 只在打开时挂载：对话框的初始值就能直接从 props 读，不用 useEffect 往 state 里同步 */}
      {editor ? (
        <CategoryEditorDialog
          type={type}
          category={editor.category}
          // 只跟同一层比重名：「餐饮 > 早餐」和「交通 > 早餐」互不冲突
          siblingNames={rows
            .filter((c) => (c.parentId ?? null) === (editor.parent?.id ?? editor.category?.parentId ?? null))
            .map((c) => c.name)}
          parentId={editor.parent?.id}
          parentName={editor.parent?.name}
          onDismiss={() => setEditor(null)}
        />
      ) : null}

      {movingCategory ? (
        <CategoryParentPicker
          category={movingCategory}
          // 候选只有一级分类，而且把它自己排掉——挂到自己身上 db 层也会拦，
          // 但让一个必定失败的选项出现在列表里本身就是个 bug
          parents={parents.filter((p) => p.id !== movingCategory.id)}
          error={move.error?.message ?? null}
          onPick={(parentId) =>
            move.mutate({ id: movingCategory.id, parentId }, { onSuccess: () => setMovingFor(null) })
          }
          onDismiss={() => setMovingFor(null)}
        />
      ) : null}

      {pendingDelete ? (
        <ModalHost visible onRequestClose={dismissDelete}>
          <ModalDialog title="删除分类" onDismiss={dismissDelete}>
            <ThemedText themeColor="textSecondary">
              「{pendingDelete.name}」删掉之后不能恢复。没有记录在用它，所以不会影响任何账单。
            </ThemedText>
            {deleteCategory.error ? (
              <ThemedText type="small" style={{ color: theme.expense }}>
                删不掉：{deleteCategory.error.message}
              </ThemedText>
            ) : null}
            <DialogActions
              confirmLabel="删除"
              destructive
              onCancel={dismissDelete}
              onConfirm={confirmDelete}
              confirmDisabled={deleteCategory.isPending}
            />
          </ModalDialog>
        </ModalHost>
      ) : null}
    </SafeAreaView>
  );
}

type CategoryGroupProps = {
  category: Category;
  subcategories: Category[];
  expanded: boolean;
  dragging: boolean;
  onMore: () => void;
  onChildPress: (child: Category) => void;
  onAddChild: () => void;
};

/**
 * 一个一级分类连同它展开时的子分类网格。
 *
 * 收起时高度**必须**正好是 ROW_HEIGHT：拖动排序按这个数算每一行的位置，
 * 这里多给几个 padding，拖起来就会跟手指错位。
 */
function CategoryGroup({
  category,
  subcategories,
  expanded,
  dragging,
  onMore,
  onChildPress,
  onAddChild,
}: CategoryGroupProps) {
  const theme = useTheme();
  const inactive = !category.isActive;

  return (
    <View
      style={[
        styles.card,
        // 拿起来的那张卡只换底色，**不动任何会重建原生背景的属性**
        // （elevation / borderWidth / overflow 都算），原因见 styles.lifted
        { backgroundColor: dragging ? theme.backgroundSelected : theme.backgroundElement },
        dragging && styles.lifted,
        inactive && styles.inactiveCard,
      ]}>
      <View style={styles.header}>
        <Ionicons
          // 实心小三角，跟最初那张参考图一致。线条箭头（chevron-forward/down）在深色底上
          // 只有两笔，展开与否要盯着看才分得清；三角是一整块，方向一眼就读出来
          name={expanded ? 'caret-down' : 'caret-forward'}
          size={CHEVRON_SIZE}
          color={theme.textSecondary}
          // 没有子分类的不画箭头，但位置留着：不留的话没有子分类的那几行图标会往左顶，
          // 整列图标不在一条线上
          style={[styles.chevron, subcategories.length === 0 && styles.chevronHidden]}
        />
        <View style={styles.iconWrap}>
          <CategoryIcon icon={category.icon} size={22} />
        </View>
        <ThemedText type="default" style={styles.name} numberOfLines={1}>
          {category.name}
        </ThemedText>
        {inactive ? (
          <ThemedText type="small" themeColor="textSecondary">
            已停用
          </ThemedText>
        ) : subcategories.length > 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            {subcategories.length}
          </ThemedText>
        ) : null}
        <Pressable onPress={onMore} hitSlop={12} style={styles.moreButton}>
          <Ionicons name="ellipsis-vertical" size={20} color={theme.textSecondary} />
        </Pressable>
      </View>

      {expanded ? (
        <View style={styles.grid}>
          {toRows([
            ...subcategories.map((child) => (
              <Pressable key={child.id} onPress={() => onChildPress(child)} style={styles.cell}>
                <View style={[styles.cellIcon, !child.isActive && styles.inactiveCard]}>
                  <CategoryIcon icon={child.icon} size={22} />
                </View>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.cellLabel}>
                  {child.name}
                </ThemedText>
              </Pressable>
            )),
            <Pressable key="__add" onPress={onAddChild} style={styles.cell}>
              <View style={[styles.cellIcon, styles.addCell, { borderColor: theme.textSecondary }]}>
                <Ionicons name="add" size={18} color={theme.textSecondary} />
              </View>
              <ThemedText type="small" themeColor="textSecondary" style={styles.cellLabel}>
                添加
              </ThemedText>
            </Pressable>,
          ])}
        </View>
      ) : null}
    </View>
  );
}

/**
 * 切成一行 GRID_COLUMNS 个，每行是一个真的 row（格宽和间距都是定数，见 styles.gridRow）。
 *
 * **不能用 flexWrap 换行**：这一版的格子是固定宽度，靠 wrap 换行等于把换行点交给
 * 容器宽度去算——屏幕稍窄一点就变成一行四个，而 GRID_COLUMNS 这个数是要跟记账页那张网格
 * 对齐的（两边看到的排布得是一回事）。自己切行，一行几个就由这个常数说了算。
 *
 * （更早还踩过另一版的坑：flexWrap + `width: '20%'`，1/5 在多数屏宽上除不尽，
 * 每格四舍五入到整数像素之后 5 格加起来超过容器宽度，第 5 格被挤到下一行——
 * 表现同样是"一行只剩 4 个"。记账页那张网格和日历的 1/7 都踩过。）
 */
function toRows(cells: ReactNode[]): ReactNode[] {
  const rows: ReactNode[] = [];
  for (let i = 0; i < cells.length; i += GRID_COLUMNS) {
    const row = cells.slice(i, i + GRID_COLUMNS);
    // 补齐最后一行。space-between 分的是"剩下多少宽度"，不补的话只有三四格的那一行
    // 会把它们摊开铺满整行，列就跟上一行对不齐了
    const padding = Array.from({ length: GRID_COLUMNS - row.length }, (_, k) => (
      <View key={`__pad${k}`} style={styles.cell} />
    ));
    rows.push(
      <View key={i} style={styles.gridRow}>
        {row}
        {padding}
      </View>,
    );
  }
  return rows;
}

function groupByParent(rows: Category[]) {
  const parents = rows.filter((c) => !c.parentId);
  const childrenOf = new Map<string, Category[]>();
  for (const row of rows) {
    if (!row.parentId) continue;
    const bucket = childrenOf.get(row.parentId);
    if (bucket) bucket.push(row);
    else childrenOf.set(row.parentId, [row]);
  }
  return { parents, childrenOf };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // tabs 搬进导航栏之后，列表顶上那段留白也归它自己管了
  list: {
    paddingTop: Spacing.three,
    paddingHorizontal: ScreenPadding,
    paddingBottom: Spacing.five,
  },
  tip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    borderRadius: 12,
    padding: Spacing.three,
    marginBottom: Spacing.three,
  },
  tipIcon: {
    marginTop: 1,
  },
  tipText: {
    flex: 1,
    gap: 2,
  },
  tipClose: {
    marginTop: 1,
  },
  card: {
    borderRadius: 12,
    // 没有 overflow: 'hidden'。卡里本来也没有东西会溢出（网格自带内边距），
    // 而圆角 + 裁剪 + 拖动时临时改样式凑在一起，正是下面那个坑的温床
  },
  /**
   * 拿起来的那张卡。**只有 iOS 的阴影属性**——它们在 Android 上是空操作。
   *
   * 这里曾经有 `elevation: 8` 和 `borderWidth: 1`。症状是：拖过的那一行，
   * 之后整张卡的内容（图标、文字、`⋯`、展开的子分类网格）全都不再绘制，
   * 卡的底色和高度却还在，也照样点得动、照样能弹出编辑框。
   *
   * 成因是这两个属性都会让 Android 重建这张卡的原生背景/轮廓
   * （elevation 要 outline，borderWidth 要换一套 background drawable），
   * 而这张卡同时还有 borderRadius 和 overflow: 'hidden'。拖动开始时加上、松手再撤掉，
   * 这一加一撤之后子视图就被永久裁没了。**只有被拖过的那一行会坏**，正是这个缘故。
   *
   * 所以拖动反馈改成换底色（纯颜色，不碰原生 drawable）。
   * 代价是 Android 上被拖那行不再盖在邻居上面——邻居本来就在让位，重叠只是一两帧的事。
   */
  lifted: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  inactiveCard: {
    opacity: 0.55,
  },
  // 右边不留内距，⋯ 尽量靠边；左边只给展开标记留一点余量（见 ROW_EDGE），
  // 中间那段宽度全让给子分类网格
  header: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingLeft: ROW_EDGE,
  },
  // 宽度是占位，字号比它小，所以要居中——否则三角会贴在占位框的左边
  chevron: {
    width: CHEVRON_WIDTH,
    textAlign: 'center',
  },
  chevronHidden: {
    opacity: 0,
  },
  // 只是一个用来定位和对齐的方框，**不画底色**：图标本身已经是有颜色的图，
  // 再垫一个圆底只是多一层跟内容无关的装饰，而且深色主题下那个圈跟卡片底色几乎分不开
  iconWrap: {
    width: ICON_BOX,
    height: ICON_BOX,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    flex: 1,
    marginLeft: Spacing.one,
  },
  // 窄一点让 ⋯ 更靠边；点得着靠 hitSlop 往外扩，不靠这个宽度撑
  moreButton: {
    width: 24,
    height: ROW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 左右对称、只留一点边：子分类铺满整张卡的宽度，不再缩进去跟父级图标对齐
  grid: {
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.three,
    rowGap: Spacing.three,
  },
  /**
   * 一行 GRID_COLUMNS 格，每格 `flex: 1` 平分整行。
   *
   * 早先为了让第一格跟父级图标对齐，格宽被钉死成图标框那么宽、空隙交给 space-between 去分，
   * 名字还得靠"比格子宽、溢出到空隙里"才放得下。对齐这个要求去掉之后这些都不必要了：
   * 平分之后每格本身就有五十来点宽，名字直接占满一格居中即可，
   * 既不会跟邻格挨上，也不用再维护一个跟列数互相牵制的宽度常数。
   */
  gridRow: {
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.one,
  },
  cellLabel: {
    width: '100%',
    textAlign: 'center',
  },
  // 跟父级的 iconWrap 同宽同高，两边的图标才在同一条竖线上。同样不画底色
  cellIcon: {
    width: ICON_BOX,
    height: ICON_BOX,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 「添加」那一格保留虚线圈：它不是图标的底色，而是"这里还空着"这个意思本身。
  // cellIcon 现在没有圆角了，圆得自己画
  addCell: {
    borderRadius: ICON_BOX / 2,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginTop: Spacing.three,
  },
  inactiveSection: {
    marginTop: Spacing.four,
    gap: ROW_GAP,
  },
  sectionLabel: {
    paddingLeft: Spacing.one,
    marginBottom: Spacing.one,
  },
  inactiveRow: {
    borderRadius: 12,
  },
});
