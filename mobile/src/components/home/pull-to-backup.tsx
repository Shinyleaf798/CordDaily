import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';

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
const LOADING_HEIGHT = 56;

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
  /** 这次从哪个手指位移开始算——中途从下面滚回顶部再往下拉时，前面那段滚动不该算进去 */
  private pullStart: number | null = null;
  /** 当前拉下来多少（已打过折） */
  private pulled = 0;
  /** 正在备份，这段时间的拖动一律不理 */
  busy = false;

  setScrollY(y: number) {
    this.scrollY = y;
  }

  setBusy(value: boolean) {
    this.busy = value;
  }

  /** 手指动了一下，返回页面该下来多少；不该响应（不在顶上 / 正在备份）时返回 null */
  move(translationY: number): number | null {
    if (this.busy) return null;
    if (this.scrollY > 0) {
      this.pullStart = null;
      return null;
    }
    this.pullStart ??= translationY;
    this.pulled = Math.min(Math.max((translationY - this.pullStart) * DAMPING, 0), MAX_PULL);
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
 * gesture-handler 的 ScrollView 能跟一个拖动手势**同时**认手，于是"在顶上往下拉"归这里、
 * 其余时候照常滚动。动画仍然是 RN 自带的 Animated，没有拉 reanimated 的 worklet 进来——
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
    Animated.spring(pull, { toValue: value, useNativeDriver: true, bounciness: 4 }).start(() => onDone?.());

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

  const pan = Gesture.Pan()
    .runOnJS(true)
    // 只认往下的竖向拖：横着划、往上推都直接放给 ScrollView
    .activeOffsetY(10)
    .failOffsetX([-20, 20])
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

  const native = Gesture.Native();
  const gesture = Gesture.Simultaneous(pan, native);

  return (
    <View style={styles.root}>
      {/* 提示放在内容**后面**：页面往下走，它才露出来 */}
      <View style={styles.indicator} pointerEvents="none">
        {phase === 'loading' ? (
          <>
            <ActivityIndicator size="small" color={theme.cardHighlight} />
            <ThemedText type="small" themeColor="textSecondary">
              正在备份…
            </ThemedText>
          </>
        ) : phase !== 'idle' ? (
          <>
            <Ionicons
              name={phase === 'armed' ? 'arrow-up' : 'arrow-down'}
              size={14}
              color={phase === 'armed' ? theme.cardHighlight : theme.textSecondary}
            />
            <ThemedText type="small" style={{ color: phase === 'armed' ? theme.cardHighlight : theme.textSecondary }}>
              {phase === 'armed' ? '松手开始备份' : '下拉备份到云端'}
            </ThemedText>
          </>
        ) : null}
      </View>

      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.root, { transform: [{ translateY: pull }] }]}>
          <ScrollView
            contentContainerStyle={contentContainerStyle}
            onScroll={(event) => {
              drag.setScrollY(event.nativeEvent.contentOffset.y);
            }}
            scrollEventThrottle={16}
            // iOS 自带的回弹会跟这里的下拉打架：两边都在往下拖同一块内容
            bounces={false}
            overScrollMode="never">
            {children}
          </ScrollView>
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
    top: 0,
    left: 0,
    right: 0,
    height: LOADING_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
});
