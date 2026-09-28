import { useCallback, useState } from 'react';

import type { TaskState } from '@/components/ui/task-dialog';

type SuccessView = { message: string; detail?: string };

type RunOptions<T> = {
  /** 跑的时候显示的那句话，例如「正在备份到云端…」 */
  running: string;
  /**
   * 成功之后显示什么。返回 `null` 表示**不弹成功框**——
   * 调用方自己有更详细的结果画面时用（恢复就是这样，它要列出恢复了哪些东西）。
   */
  success: (result: T) => SuccessView | string | null;
  /** 怎么把异常翻译成人话。默认取 `error.message`，同步相关的调用方传 `describeError` */
  describeError?: (error: unknown) => string;
};

/**
 * 驱动 `TaskDialog` 的那点状态。
 *
 * 为什么不直接用 React Query mutation 的 `isPending / isError`：那几个布尔量回答的是
 * "请求到哪一步了"，而这里要回答的是"**用户现在该看到哪一张画面**"。两者大部分时候重合，
 * 但成功之后差得最远——mutation 的 `isSuccess` 会一直是 true，而成功框是要能被关掉的；
 * 于是又得配一个 `dismissed` 布尔量去盖过它，两个真相打架。这里只存一个状态。
 *
 * 用法：
 * ```tsx
 * const task = useTask();
 * task.run({ running: '正在备份…', success: (r) => `上传了 ${r.transactions} 笔` }, () => push());
 * // 渲染：task.state && <TaskDialog state={task.state} onDismiss={task.dismiss} />
 * ```
 */
export function useTask() {
  const [state, setState] = useState<TaskState | null>(null);

  const run = useCallback(async <T>(options: RunOptions<T>, task: () => Promise<T>): Promise<T | undefined> => {
    setState({ status: 'running', message: options.running });
    try {
      const result = await task();
      const view = options.success(result);
      setState(view === null ? null : typeof view === 'string' ? { status: 'success', message: view } : { status: 'success', ...view });
      return result;
    } catch (error) {
      const describe = options.describeError ?? ((thrown: unknown) => (thrown as Error)?.message ?? '出了点问题');
      // 失败这一态必须显示，不能吞掉：这几个操作（备份、恢复）用户等了好几秒，
      // 界面一声不吭地回到原样，他没法判断到底成没成
      setState({ status: 'error', message: '没有成功', detail: describe(error) });
      return undefined;
    }
  }, []);

  const dismiss = useCallback(() => setState(null), []);

  return { state, run, dismiss, isRunning: state?.status === 'running' };
}
