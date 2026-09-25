import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, View, type GestureResponderEvent } from 'react-native';

type DragSortListProps = {
  /** 当前顺序的 id 列表。拖完之后由调用方把新顺序传回来 */
  ids: string[];
  /** 一行**收起时**的高度。拖动过程中所有行都必须是这个高度，见下面的说明 */
  rowHeight: number;
  /** 行与行之间的间距 */
  rowGap: number;
  renderRow: (id: string, isDragging: boolean) => ReactNode;
  /** 点一行（不是长按）。长按被这个组件吃掉了，普通点击还得还给调用方 */
  onRowPress?: (id: string) => void;
  /** 进入/退出拖动。调用方拿它关掉外层 ScrollView 的滚动，并把展开的内容收起来 */
  onDragStateChange?: (draggingId: string | null) => void;
  /** 手指松开且位置真的变了才调，参数是完整的新顺序 */
  onDrop: (orderedIds: string[]) => void;
};

/**
 * 长按拖动排序的列表。
 *
 * **布局自始至终是正常的文档流**，拖动只改 transform。
 * transform 不参与排版，所以拖的过程中没有任何一次重新布局。
 *
 * 这里曾经写成"拖动时切成绝对定位、每行钉在 index * 行高上"。那版在真机上的表现是
 * 拖完一次之后整行的图标和文字都不见了、行却还点得动——切回文档流时 position/top/height
 * 这几个被撤掉的样式没有干净地还原。现在不切了，那类问题整个消失，
 * 而算落点需要的"每行等高"仍然成立：调用方在 `onDragStateChange` 里把展开的组收起来，
 * 那个 setState 跟组件内部那次是同一批，落在同一次渲染里。
 *
 * 为什么用 RN 自带的手势和 Animated，而不是 reanimated + gesture-handler：
 * 项目里已经有 Animated 的先例（modal-sheet 的进出场），而 reanimated 4 要跑 worklet、
 * 要 babel 插件、手势要 GestureHandlerRootView 包根节点——这套东西在本项目一次都还没用过，
 * 为一个"拖十几行"的列表把它整套接进来，出问题的面积比这个功能本身还大。
 *
 * **一个 zIndex 都不用**：Android 上只要有子视图带 zIndex，父容器就会切换到"自定义绘制顺序"模式，
 * 而那份顺序是缓存出来的——拖动时给某一行加 zIndex、松手再撤掉，缓存就可能跟真实子视图对不上，
 * 结果是某些行永远不再被绘制（位置和触摸都还正常，就是画不出来）。
 * 那被拖的那一行怎么盖住邻居？**不盖**。elevation 这条路也堵死了——它会让 Android
 * 重建那张卡的原生轮廓，结果是拖过的行从此整个子树都不再绘制（详见 categories.tsx 的 styles.lifted）。
 * 好在邻居本来就在往两边让位，真正重叠只有一两帧；拖动中的反馈改由 renderRow 换个底色来给。
 *
 * 用 View 自带的 responder 属性而不是 PanResponder：`PanResponder.create(...)` 得在渲染期间调用，
 * 而它收的那些回调都要读手势状态（存在 ref 里），react-hooks/refs 把"渲染期间把读 ref 的函数交出去"
 * 也算违规。直接挂 onResponderMove 这些属性就没有这道坎，代价只是位移得自己减一下
 * （PanResponder 的 gestureState.dy 就是它替你做的这件事）。
 *
 * 还没做**拖到边缘自动滚动**：分类收起来之后一屏放得下十来个一级分类，
 * 超出的先滚到位再拖也不别扭。真要加，加在这里，调用方不用改。
 */
export function DragSortList({
  ids,
  rowHeight,
  rowGap,
  renderRow,
  onRowPress,
  onDragStateChange,
  onDrop,
}: DragSortListProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const slot = rowHeight + rowGap;

  // 每行一个位移值，按 id 存：顺序变了之后还是同一个 id 对同一个值，不会串行。
  // 用 useState 的惰性初始值而不是 useRef：这个 Map 在渲染期间就要读（给每行取位移值），
  // 而 react-hooks/refs 不允许渲染期间碰 ref
  const [offsets] = useState(() => new Map<string, Animated.Value>());
  const offsetOf = useCallback(
    (id: string) => {
      let value = offsets.get(id);
      if (!value) {
        value = new Animated.Value(0);
        offsets.set(id, value);
      }
      return value;
    },
    [offsets],
  );

  /**
   * 手势回调创建于某一次渲染，闭包里捕获的 props 会永远停在那一次，所以得有个盒子放最新的值。
   * 同步写在 effect 里而不是渲染中：渲染期间给 ref 赋值是 react-hooks/refs 明令禁止的。
   * 对这里没影响——盒子只在用户按下手指之后才被读到，那时 effect 早就跑完了。
   */
  const live = useRef({ ids, slot, onDrop, onDragStateChange });
  useEffect(() => {
    live.current = { ids, slot, onDrop, onDragStateChange };
  }, [ids, slot, onDrop, onDragStateChange]);

  /** 一次拖动过程中的全部可变状态。只在事件回调里读写，渲染期间碰都不碰 */
  const drag = useRef<{
    /** 正在被拖的那行**原来**的下标，null = 没在拖 */
    from: number | null;
    /** 松手之后它该落到第几个 */
    to: number | null;
    /** 长按那一刻手指的屏幕纵坐标，位移都是相对它算的 */
    startY: number;
    /** 手势是否已经被这个列表接管。用来区分"长按完没动就松手"和"正拖着" */
    claimed: boolean;
  }>({ from: null, to: null, startY: 0, claimed: false });

  /**
   * 把所有位移归零。
   *
   * 清零之前必须先 stopAnimation：松手那一刻"让位"的 spring 很可能还在飞，
   * 它的目标是 ±一行高，不停掉的话它会在 setValue(0) 之后继续跑完，
   * 把那一行永久顶偏一整行的位置。
   */
  const resetOffsets = useCallback(() => {
    for (const value of offsets.values()) {
      value.stopAnimation();
      value.setValue(0);
    }
  }, [offsets]);

  /** 已经把新顺序交出去了，正等着它落地的那一次提交来清位移。见 endDrag 的说明 */
  const settlePending = useRef(false);

  /**
   * 位移的归零点。没有依赖数组是故意的——它要赶上「新顺序落地」的**那一次**提交，
   * 而那次提交由哪个 state 触发不重要。settlePending 为假时它什么都不做。
   *
   * 用 useLayoutEffect 而不是 useEffect：清位移必须跟新顺序的原生更新同一帧生效，
   * 晚一帧就又成了下面 endDrag 里说的那种闪烁，只是方向反过来。
   */
  useLayoutEffect(() => {
    if (!settlePending.current) return;
    settlePending.current = false;
    resetOffsets();
  });

  const endDrag = useCallback(() => {
    const { from, to } = drag.current;
    drag.current = { from: null, to: null, startY: 0, claimed: false };

    setDraggingId(null);
    live.current.onDragStateChange?.(null);

    if (from === null || to === null || from === to) {
      // 位置没变：不会有人拿新顺序来重渲染，位移只能就地归零
      resetOffsets();
      return;
    }

    /**
     * 位置变了，**这里偏偏不能归零**。
     *
     * setValue 绕过 React 直接改原生属性，是同步立刻生效的；而新顺序是 setState，
     * 要等下一次提交。两件事差着一帧，中间那一帧就是「行还停在旧位置、位移却已经没了」——
     * 画出来正是交换的那两行闪回原位、下一帧才跳到交换后的位置。
     *
     * 所以留着位移不动（此刻它画出来的就是最终该在的位置），
     * 立个标记，等新顺序落地的那次提交由上面那个 layout effect 一起清掉。
     */
    settlePending.current = true;
    const next = [...live.current.ids];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    live.current.onDrop(next);
  }, [resetOffsets]);

  const handleMove = useCallback(
    (event: GestureResponderEvent) => {
      const { from, startY } = drag.current;
      if (from === null) return;
      const { ids: rows, slot: step } = live.current;
      const dy = event.nativeEvent.pageY - startY;

      offsetOf(rows[from]).setValue(dy);

      // 跨过半行就算换位：round 的边界正好落在半行处
      const to = clamp(Math.round(from + dy / step), 0, rows.length - 1);
      if (to === drag.current.to) return;
      drag.current.to = to;

      // 被拖的那行跨过谁，谁就往反方向让一行。让位是动画的，
      // 让用户看见"位置腾出来了"，而不是松手才发现结果
      rows.forEach((id, index) => {
        if (index === from) return;
        let shift = 0;
        if (from < to && index > from && index <= to) shift = -step;
        else if (from > to && index >= to && index < from) shift = step;
        // 不开 useNativeDriver：同一个位移值在这里被 spring 驱动、在别处被 setValue 直接写
        // （被拖的那行每一帧都是 setValue，而行与行的角色每次拖动都会互换）。
        // 一个节点一旦交给原生驱动，再从 JS 侧 setValue 就对不上了——十几行的位移，JS 线程够用
        Animated.spring(offsetOf(id), { toValue: shift, useNativeDriver: false, bounciness: 0, speed: 20 }).start();
      });
    },
    [offsetOf],
  );

  /**
   * 只有长按已经把某一行标成 from 之后才接管手势。
   * 不接管的时候整个列表对手势是透明的，点击、滚动都照常。
   *
   * 返回 true 的**这一刻**就记上 claimed，不能等到 onResponderGrant：
   * RN 的交接顺序是「先终止原来的响应者，再授予新的」，而原来的响应者正是那一行的 Pressable，
   * 它被终止时会触发 onPressOut——也就是说 onPressOut 比 onResponderGrant 先到。
   * 标记立晚了，那一下就会被 cancelIfNotClaimed 当成"长按完没动就松手"，拖动刚开始就被取消。
   */
  const shouldClaim = useCallback(() => {
    if (drag.current.from === null) return false;
    drag.current.claimed = true;
    return true;
  }, []);
  const refuseTermination = useCallback(() => false, []);

  const beginDrag = (index: number, event: GestureResponderEvent) => {
    // 起点取长按那一刻的位置，而不是接管手势那一刻：两者差着用户从按下到开始移动的那几像素，
    // 用后者的话卡片会在拖动开始时轻轻跳一下
    drag.current = { from: index, to: index, startY: event.nativeEvent.pageY, claimed: false };
    const id = live.current.ids[index];
    setDraggingId(id);
    live.current.onDragStateChange?.(id);
  };

  // 长按之后手指没动就抬起来：这时手势从没被接管过，也就等不到 onResponderRelease。
  // `claimed` 就是用来区分这两种情况的——真的在拖时，Pressable 会因为失去响应者而触发
  // onPressOut，那一下不能当成取消，否则拖到一半就断了
  const cancelIfNotClaimed = () => {
    if (drag.current.from === null || drag.current.claimed) return;
    drag.current = { from: null, to: null, startY: 0, claimed: false };
    setDraggingId(null);
    live.current.onDragStateChange?.(null);
  };

  return (
    <View
      // 同上：这一层只挂手势、没有底色，被折叠掉之后手势也就没人接了
      collapsable={false}
      onMoveShouldSetResponder={shouldClaim}
      onMoveShouldSetResponderCapture={shouldClaim}
      onResponderMove={handleMove}
      onResponderRelease={endDrag}
      // 被别的手势抢走（比如系统返回手势）也要收尾，否则列表会卡在"某一行浮着"的状态
      onResponderTerminate={endDrag}
      onResponderTerminationRequest={refuseTermination}>
      {ids.map((id, index) => {
        const active = id === draggingId;
        return (
          <Animated.View
            key={id}
            // Android 会把"看起来没有视觉作用"的 View 从原生树里折叠掉。这一层没有底色，
            // 平时正是折叠的对象，而拖动一开始又必须变回真的 View 来承载 transform——
            // 这一折一展就是行内容消失、位置却还在（照样点得动）的由来。明确关掉折叠
            collapsable={false}
            style={[
              { marginBottom: index === ids.length - 1 ? 0 : rowGap },
              { transform: [{ translateY: offsetOf(id) }] },
            ]}>
            <Pressable
              onPress={() => onRowPress?.(id)}
              onLongPress={(event) => beginDrag(index, event)}
              onPressOut={cancelIfNotClaimed}
              delayLongPress={220}>
              {renderRow(id, active)}
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

