import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { ThemedText } from '@/components/ui/themed-text';
import { Toast, useToast } from '@/components/ui/toast';
import { describeError } from '@/db/sync';
import { usePushToCloud } from '@/hooks/use-backup';
import { useCloudSession } from '@/hooks/use-cloud';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/store/auth.store';

/** 页面跟着手指走多少：手指拉 100，页面只下来 50。不打折的话拉起来像拖着一块没有重量的板子 */
const DAMPING = 0.5;
/** 页面最多下来这么多，再拉也不动 */
const MAX_PULL = 140;
/** 拉过这条线松手才备份，没过就弹回去当没发生 */
const TRIGGER = 72;
/** 备份进行中页面停在这个位置，空出来的那一截放转圈 */
const LOADING_HEIGHT = 60;
/** 水滴头的直径，和它离顶上的距离 */
const HEAD = 36;
const HEAD_TOP = 10;
/** 页面拉下来这么多，水滴头才整个露出来，再往下才开始拉出尾巴 */
const STRETCH_FROM = HEAD_TOP + HEAD + 6;

type Phase = 'idle' | 'pulling' | 'armed' | 'loading';

/**
 * 手势过程中要改、但改了不用重渲染的几个数，收在一个小类里，**只通过方法改**。
 *
 * 不用 useRef：手势回调是在渲染期间交给 Gesture 的，react-hooks/refs 不许那样读 ref（drag-sort-list 碰到过同一道坎）；
 * 也不能放一个普通对象在 useState 里直接改字段，react-hooks/immutability 会拦。
 * 方法调用跟 Animated.Value.setValue 是同一回事，两条规则都不管
 */
class DragTracker {
  /** 列表滚到哪了，只有在顶上（0）往下拉才算下拉 */
  private scrollY = 0;
  /**
   * 下拉从哪个手指位移开始算：**列表滚到顶的那一刻**手指走到了哪。
   * 这就是常见 App 的"先滚动、滚到顶后剩下的拉动才算下拉"——从列表中间一口气往下拖，
   * 前面那段花在把列表滚回顶部，到顶之后手指接着走的那段才让页面往下走。
   * 手指一松手势就结束，之后靠惯性滑到顶不会变成下拉，所以快速甩回顶部不会误触发备份
   */
  private pullStart: number | null = null;
  /** 当前拉下来多少（已打过折） */
  private pulled = 0;
  /** 正在备份，这段时间的拖动一律不理 */
  busy = false;

  setScrollY(y: number) {
    this.scrollY = y;
  }

  /** 手指按下 */
  begin() {
    this.pullStart = null;
    this.pulled = 0;
  }

  setBusy(value: boolean) {
    this.busy = value;
  }

  /** 手指动了一下，返回页面该下来多少；不该响应（不在顶上 / 正在备份）时返回 null */
  move(translationY: number): number | null {
    if (this.busy) return null;
    if (this.pullStart === null) {
      // 列表还没到顶：这段拖动归滚动，下拉的起点等到顶了再定。
      // 留 1px 余量：页面被往下拖时，原生那边会报出零点几的 contentOffset，当成「不在顶上」的话
      // 下拉会在 0 和当前值之间来回跳——慢慢拉时的「抽搐」就是这么来的
      if (this.scrollY > 1) return null;
      this.pullStart = translationY;
    }
    // 一旦开始下拉就**锁在下拉里**，不再看列表滚到哪：往回推只是把页面推回去，
    // 推回起点才把手势交还给滚动。否则往上推时列表也跟着往上滚，页面却还停在下面，
    // 顶上那截空白（深色主题里是黑的）就盖住了第一张卡
    const raw = (translationY - this.pullStart) * DAMPING;
    // 严格小于：刚定下起点的那一帧 raw 正好是 0，那时候清掉起点就永远拉不起来
    if (raw < 0) {
      this.pullStart = null;
      this.pulled = 0;
      return 0;
    }
    this.pulled = Math.min(raw, MAX_PULL);
    return this.pulled;
  }

  /** 手指抬起，返回这次拉了多少，并清零 */
  release(): number {
    const pulled = this.pulled;
    this.pullStart = null;
    this.pulled = 0;
    return pulled;
  }
}

type PullToBackupProps = {
  contentContainerStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/**
 * 首页的「下拉备份」：整页往下拉，顶上露出一行提示——没拉够是「下拉备份到云端」，
 * 拉够了变成「松手开始备份」；松手后页面停在一截转圈 +「正在备份…」，备份完弹回去，用一条提示说结果。
 * 走的是跟「立即备份」同一个 `usePushToCloud`（CLAUDE.md 原则#1：手动和自动是同一个函数）。
 *
 * **为什么不用 RN 自带的 RefreshControl**：Android 上它只在顶上画一个转圈的小圆，页面本身不动，
 * 也没地方写「松手开始备份」这种字；要"整页往下拉、拉够才算"只能自己画。
 *
 * **为什么这里用 react-native-gesture-handler**（项目里别处都是 RN 自带的 responder）：
 * Android 的原生 ScrollView 在手指一动就把触摸整个拦走，JS 那边的 responder 在页面顶上往下拉时根本收不到。
 * 用 gesture-handler 把 RN 自带的 ScrollView 包成一个 Native 手势，再让下拉的 Pan 声明跟它**同时**认手，
 * 于是"在顶上往下拉"归这里、其余时候照常滚动。注意包的是 **RN 的** ScrollView：
 * gesture-handler 自己的 ScrollView 已经带着一个原生手势，外面再包一层 Native 会重复注册，真机上整页滑不动。动画仍然是 RN 自带的 Animated，没有拉 reanimated 的 worklet 进来——
 * 手势回调用 runOnJS(true) 跑在 JS 线程上，对一个只在顶部拉一下的手势足够了。
 */
export function PullToBackup({ contentContainerStyle, children }: PullToBackupProps) {
  const theme = useTheme();
  const user = useAuthStore((s) => s.user);
  const { data: cloudSession } = useCloudSession();
  const pushToCloud = usePushToCloud();
  const toast = useToast();

  const [pull] = useState(() => new Animated.Value(0));
  const [phase, setPhase] = useState<Phase>('idle');
  const [drag] = useState(() => new DragTracker());

  const springTo = (value: number, onDone?: () => void) =>
    // 不用 native driver：水滴尾巴是改 height/width，native driver 驱动不了布局属性，而同一个 Animated.Value 不能两边混用。
    // 手势本来就在 JS 线程上 setValue，回弹也走 JS 线程不会更卡
    Animated.spring(pull, { toValue: value, useNativeDriver: false, bounciness: 0, speed: 16 }).start(() => onDone?.());

  const runBackup = () => {
    drag.setBusy(true);
    setPhase('loading');
    springTo(LOADING_HEIGHT);

    const finish = (message: string) => {
      springTo(0, () => {
        drag.setBusy(false);
        setPhase('idle');
      });
      toast.show(message);
    };

    // 两条通道都没有就没地方可推（同 _layout 里自动同步的判断）。停一下再弹回去，不然转圈一闪而过像没反应
    if (!user && !cloudSession) {
      setTimeout(() => finish('还没连云端，先在「我的 → 云端连接」里连一个'), 600);
      return;
    }

    pushToCloud.mutate(
      {},
      {
        onSuccess: (result) =>
          finish(result.transactions > 0 ? `已备份 ${result.transactions} 笔账单` : '已经是最新的了，没有要备份的账单'),
        onError: (error) => finish(`没备份成功：${describeError(error)}`),
      },
    );
  };

  const tailWidth = pull.interpolate({ inputRange: [STRETCH_FROM, MAX_PULL], outputRange: [HEAD, 22], extrapolate: 'clamp' });

  const pan = Gesture.Pan()
    .runOnJS(true)
    // 只认往下的竖向拖：横着划、往上推都直接放给 ScrollView
    .activeOffsetY(10)
    .failOffsetX([-20, 20])
    .onBegin(() => drag.begin())
    .onUpdate((event) => {
      const distance = drag.move(event.translationY);
      if (distance === null) return;
      pull.setValue(distance);
      const next: Phase = distance === 0 ? 'idle' : distance >= TRIGGER ? 'armed' : 'pulling';
      setPhase((current) => (current === next ? current : next));
    })
    .onFinalize(() => {
      const pulled = drag.release();
      if (drag.busy) return;
      if (pulled >= TRIGGER) {
        runBackup();
      } else if (pulled > 0) {
        springTo(0, () => setPhase('idle'));
      }
    });

  // 列表自己的滚动手势要**挂在 ScrollView 本身上**（里面那个 GestureDetector），下拉再声明跟它同时认手。
  // 第一版把两个手势拼成一个挂在外层 View 上：那个 Native 手势挂到的是一块普通 View，
  // ScrollView 真正的滚动手势跟下拉之间就没有任何"可以同时"的约定，下拉一认手就把滚动整个挡掉，
  // 真机上首页完全滑不动（模拟器上那页内容不到一屏，没暴露出来）
  const scrollGesture = Gesture.Native();
  const pullGesture = pan.simultaneousWithExternalGesture(scrollGesture);

  return (
    <View style={styles.root}>
      {/* 提示放在内容**后面**：页面往下走，它才露出来 */}
      <View style={styles.indicator} pointerEvents="none">
        <View style={styles.drop}>
          {/* 尾巴：从水滴头中心往下长，越拉越长、越细，松手或往回推就跟着缩回去 */}
          <Animated.View
            style={[
              styles.tail,
              {
                backgroundColor: theme.backgroundSelected,
                height: pull.interpolate({
                  inputRange: [0, STRETCH_FROM, MAX_PULL],
                  outputRange: [0, 0, MAX_PULL - STRETCH_FROM],
                  extrapolate: 'clamp',
                }),
                width: tailWidth,
                borderRadius: Animated.divide(tailWidth, 2),
              },
            ]}
          />
          <Animated.View
            style={[
              styles.head,
              {
                backgroundColor: theme.backgroundSelected,
                opacity: pull.interpolate({ inputRange: [0, HEAD_TOP + HEAD], outputRange: [0, 1], extrapolate: 'clamp' }),
                transform: [
                  { scale: pull.interpolate({ inputRange: [0, HEAD_TOP + HEAD], outputRange: [0.4, 1], extrapolate: 'clamp' }) },
                ],
              },
            ]}>
            {phase === 'loading' ? (
              <ActivityIndicator size="small" color={theme.cardHighlight} />
            ) : (
              <Ionicons
                name={phase === 'armed' ? 'cloud-upload-outline' : 'arrow-down'}
                size={18}
                color={phase === 'armed' ? theme.cardHighlight : theme.textSecondary}
              />
            )}
          </Animated.View>
        </View>
        {phase !== 'idle' ? (
          <ThemedText type="small" style={[styles.label, { color: phase === 'pulling' ? theme.textSecondary : theme.cardHighlight }]}>
            {phase === 'loading' ? '正在备份…' : phase === 'armed' ? '松手开始备份' : '下拉备份到云端'}
          </ThemedText>
        ) : null}
      </View>

      <GestureDetector gesture={pullGesture}>
        <Animated.View style={[styles.root, { transform: [{ translateY: pull }] }]}>
          <GestureDetector gesture={scrollGesture}>
          <ScrollView
            contentContainerStyle={contentContainerStyle}
            onScroll={(event) => {
              drag.setScrollY(event.nativeEvent.contentOffset.y);
            }}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            // 下拉开始后列表不许滚：往回推的那一下只该把页面推回去，不该同时把内容往上滚
            scrollEnabled={phase === 'idle'}
            // iOS 自带的回弹会跟这里的下拉打架：两边都在往下拖同一块内容
            bounces={false}
            overScrollMode="never">
            {children}
          </ScrollView>
          </GestureDetector>
        </Animated.View>
      </GestureDetector>

      <Toast toast={toast.toast} onHide={toast.clear} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  indicator: {
    position: 'absolute',
    top: HEAD_TOP,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  drop: {
    width: HEAD,
    alignItems: 'center',
  },
  tail: {
    position: 'absolute',
    top: HEAD / 2,
  },
  head: {
    width: HEAD,
    height: HEAD,
    borderRadius: HEAD / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 字跟在水滴头右边、和头对齐，不压在往下长的尾巴上；水滴 + 字作为一整组居中
  label: {
    marginLeft: 8,
    height: HEAD,
    lineHeight: HEAD,
  },
});
