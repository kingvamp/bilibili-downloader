// 下载流程控制器：同步管理唯一执行权，供 useDownload 控制准备、队列、暂停和停止。
export interface WorkflowRun { readonly stopped: boolean; }
interface ActiveWorkflow extends WorkflowRun {
  stopped: boolean;
  preparing: boolean;
  pendingTasks: number;
  taskRunning: boolean;
}

export class DownloadWorkflow {
  private current: ActiveWorkflow | null = null;

  /** 将流程占用变化同步给界面，界面状态不参与执行权判断。 */
  constructor(private readonly onBusyChange: (busy: boolean) => void) {}

  /** 在第一次异步操作前同步占用流程，拒绝所有重入入口。 */
  begin(): WorkflowRun | null {
    if (this.current) return null;
    this.current = { stopped: false, preparing: true, pendingTasks: 0, taskRunning: false };
    this.onBusyChange(true);
    return this.current;
  }

  /** 仅允许当前未停止的流程登记待执行任务。 */
  enqueue(count: number): WorkflowRun | null {
    if (!this.current || this.current.stopped || count <= 0) return null;
    this.current.pendingTasks += count;
    return this.current;
  }

  /** 准备阶段结束后继续保留队列和在途任务的执行权。 */
  finishPreparation(run: WorkflowRun): void {
    if (!this.current || this.current !== run) return;
    this.current.preparing = false;
    this.releaseIfIdle();
  }

  /** 原子启动一个任务，防止重复执行 React 队列 effect。 */
  startTask(owner: WorkflowRun): boolean {
    const run = this.current;
    if (!run || run !== owner || run.stopped || run.taskRunning || run.pendingTasks === 0) return false;
    run.taskRunning = true;
    return true;
  }

  /** 等待完成通知后结算任务，暂停时保留原任务供恢复执行。 */
  completeTask(paused: boolean): boolean {
    const run = this.current;
    if (!run || !run.taskRunning) return false;
    run.taskRunning = false;
    const completed = !run.stopped && !paused;
    if (completed) run.pendingTasks--;
    this.releaseIfIdle();
    return completed;
  }

  /** 停止后清空待执行任务，在途准备操作和下载结束前不释放。 */
  stop(): void {
    if (!this.current) return;
    this.current.stopped = true;
    this.current.pendingTasks = 0;
    this.releaseIfIdle();
  }

  /** 查询整个流程是否仍占用执行权。 */
  get busy(): boolean { return this.current !== null; }

  /** 查询是否仍在等待当前下载任务的完成通知。 */
  get taskRunning(): boolean { return this.current?.taskRunning ?? false; }

  /** 只有准备、待执行队列和当前下载全部结束后才释放流程。 */
  private releaseIfIdle(): void {
    const run = this.current;
    if (!run || run.preparing || run.taskRunning || run.pendingTasks > 0) return;
    this.current = null;
    this.onBusyChange(false);
  }
}
