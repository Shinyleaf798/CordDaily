import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryIcon } from '@/components/category/category-icon';
import { DragSortList } from '@/components/ui/drag-sort-list';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { ScreenPadding, Spacing } from '@/constants/theme';
import type { Category, CategoryType } from '@/db/categories';
import { useCategories, useReorderCategories } from '@/hooks/use-categories';
import { useTheme } from '@/hooks/use-theme';

/** 跟分类管理页的一级分类行同高。DragSortList 按它算落点，所以行的实际高度必须等于它 */
const ROW_HEIGHT = 50;
const ROW_GAP = Spacing.two;
/** 图标方框，跟分类管理页同一个数，两页的图标才一样大 */
const ICON_BOX = 34;

/**
 * 子分类排序：`/subcategory-order?id=<一级分类 id>&type=EXPENSE`。
 * 从分类管理页某一行的 `⋯ → 给子分类排序` 进来。
 *
 * 为什么单开一页而不是在原地把网格变成可拖动的：
 * 管理页那张网格一行七个，是为了跟记账页看到的排布对上。**网格拖动是另一套手势**——
 * 落点要算行和列两个维度，让位动画也得横竖一起走，而 DragSortList 整个是围绕
 * "每行等高、只有纵向"建起来的。为一个改顺序的操作把它扩成二维，代价远超收益。
 * 拆成一页之后，子分类变回一列，现成的列表一行不改就能用。
 *
 * 排序的口径跟一级分类完全一样：`sortOrder` 本来就是**同一层内部**的先后
 * （同收支类型、同一个父），`reorderCategories` 收的也只是"这一层的完整 id 顺序"，
 * 所以这一页跟管理页调的是同一个函数、同一个 mutation，db 层一个字都不用动。
 *
 * 停用的子分类照样列在里面、照样拖得动：管理页那张网格本来就把停用的子分类
 * 混在一起显示（只是淡一点），这一页要是把它们抽到单独一段，两处看到的就不是一回事了。
 * （一级分类那边把停用的收在末尾单独一段，是因为那是整页的主列表，性质不同。）
 */
export default function SubcategoryOrderScreen() {
  const params = useLocalSearchParams<{ id?: string; type?: string }>();
  const parentId = params.id ?? '';
  const type: CategoryType = params.type === 'INCOME' ? 'INCOME' : 'EXPENSE';

  const { data } = useCategories(type);
  const rows = useMemo(() => data ?? [], [data]);
  const parent = rows.find((c) => c.id === parentId) ?? null;
  const children = useMemo(() => rows.filter((c) => c.parentId === parentId), [rows, parentId]);
  const byId = useMemo(() => new Map(children.map((c) => [c.id, c])), [children]);

  const [dragging, setDragging] = useState(false);

  // 跟管理页同一套：手指一松列表就得停在新位置，而乐观更新要等 onMutate 走完，
  // 中间隔着一帧。存 basedOn 是为了不用 useEffect 清理——乐观更新一落地 data 就换了引用，
  // 这份覆盖自动失效，而那时 data 本身已经是新顺序
  const [pendingOrder, setPendingOrder] = useState<{ basedOn: Category[]; ids: string[] } | null>(null);
  const orderedIds = pendingOrder && pendingOrder.basedOn === data ? pendingOrder.ids : children.map((c) => c.id);

  const reorder = useReorderCategories();
  const handleDrop = (ids: string[]) => {
    setPendingOrder({ basedOn: data ?? [], ids });
    reorder.mutate({ type, orderedIds: ids });
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['bottom', 'left', 'right']}>
      {/* 标题带上父分类的名字：这一页只管一个分类底下的那几条，不写名字的话
          从两个不同的一级分类进来看到的是同一个标题 */}
      <Stack.Screen options={{ headerTitle: parent ? `${parent.name} · 子分类` : '子分类排序' }} />

      <ThemedView style={styles.container}>
        {/* 拖动时必须关掉滚动：同一根手指的纵向移动不能同时喂给 ScrollView，
            否则列表一边滚一边拖，落点完全不可控 */}
        <ScrollView scrollEnabled={!dragging} contentContainerStyle={styles.list}>
          {children.length === 0 ? (
            // 菜单那一条在没有子分类时是灰的，正常进不来。留着是因为"顺着旧链接回到这一页"
            // （从排序页返回的路上恰好把最后一个子分类删了）不该看到一片空白
            <ThemedText themeColor="textSecondary">这个分类下面还没有子分类。</ThemedText>
          ) : (
            <>
              <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                长按一行上下拖动，改它在记账页子分类里的先后
              </ThemedText>

              <DragSortList
                ids={orderedIds}
                rowHeight={ROW_HEIGHT}
                rowGap={ROW_GAP}
                onDragStateChange={(id) => setDragging(id !== null)}
                onDrop={handleDrop}
                renderRow={(id, isDragging) => {
                  const child = byId.get(id);
                  return child ? <SubcategoryRow category={child} dragging={isDragging} /> : null;
                }}
              />
            </>
          )}
        </ScrollView>
      </ThemedView>
    </SafeAreaView>
  );
}

/**
 * 一条子分类。高度**必须**正好是 ROW_HEIGHT，拖动按这个数算每一行的位置。
 *
 * 拖起来的那行只换底色，**不加 elevation / borderWidth**——这两个都会让 Android
 * 重建卡片的原生背景，结果是拖过的行从此整个子树不再绘制。
 * 详见 categories.tsx 的 styles.lifted 和 drag-sort-list 的组件注释。
 */
function SubcategoryRow({ category, dragging }: { category: Category; dragging: boolean }) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: dragging ? theme.backgroundSelected : theme.backgroundElement },
        !category.isActive && styles.inactive,
      ]}>
      <View style={styles.iconWrap}>
        <CategoryIcon icon={category.icon} size={22} />
      </View>
      <ThemedText type="default" style={styles.name} numberOfLines={1}>
        {category.name}
      </ThemedText>
      {category.isActive ? null : (
        <ThemedText type="small" themeColor="textSecondary">
          已停用
        </ThemedText>
      )}
      {/* 纯提示：告诉用户这一行是可以拖的。手势挂在整行上，不是挂在这个图标上——
          只认把手的话，得先发现把手才知道能拖 */}
      <Ionicons name="reorder-three-outline" size={22} color={theme.textSecondary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    paddingTop: Spacing.three,
    paddingHorizontal: ScreenPadding,
    paddingBottom: Spacing.five,
  },
  hint: {
    marginBottom: Spacing.three,
  },
  card: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingLeft: Spacing.two,
    paddingRight: Spacing.three,
    borderRadius: 12,
  },
  inactive: {
    opacity: 0.55,
  },
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
});
