// 下载流程的唯一控制器：所有入口在主进程同步取得执行权，队列不依赖 React 生命周期。
// 关联：downloadRuntime.ts 提供系统服务；scheduler.ts、clipboard.ts 与 preload.ts 发起命令。
import type { DownloadTask, DuplicateResult, DownloadState } from '../shared/download';

interface DownloadExecution {
  promise: Promise<number | null>;
  cancel(): void;
}

interface Dependencies {
  getSettings(): { unfavAfterDownload: boolean };
  defaultFavoriteId(): Promise<number | null>;
  inspect(url: string, log: (message: string) => void): Promise<DuplicateResult[]>;
  download(task: DownloadTask, log: (message: string) => void): DownloadExecution;
  remove(aid: number, mediaId: number): Promise<{ success: boolean; message?: string }>;
  collect(aid: number, mediaId: number): Promise<{ success: boolean; message?: string }>;
  confirmRedownload(title: string, bvid: string): Promise<boolean>;
  cancelConfirmation(): void;
  onState(state: DownloadState): void;
  onLog(message: string): void;
  onFinished(): void;
}

interface Flow {
  stopped: boolean;
  preparing: boolean;
  paused: boolean;
  checking: boolean;
  detecting: boolean;
  running: boolean;
  total: number;
  completed: number;
  queue: DownloadTask[];
  active: DownloadTask | null;
}

/** 串行运行扫描、清理和下载，停止后等待已在途操作正常结算。 */
export class DownloadManager {
  private flow: Flow | null = null;
  private execution: DownloadExecution | null = null;
  private logs = '等待任务...';

  constructor(private readonly deps: Dependencies) {}

  /** 返回真实后台状态供渲染器重载后恢复显示。 */
  snapshot(): { state: DownloadState; logs: string } {
    return { state: this.state(), logs: this.logs };
  }

  /** 为准备阶段同步取得唯一执行权。 */
  private begin(): Flow | null {
    if (this.flow) {
      this.log('\n>>> ⏳ 当前流程尚未结束，已忽略新的触发。\n');
      return null;
    }
    const run: Flow = {
      stopped: false, preparing: true, paused: false, checking: false,
      detecting: false, running: false, total: 0, completed: 0,
      queue: [], active: null
    };
    this.flow = run;
    this.publish();
    return run;
  }

  /** 追加日志并保留最近内容，避免后台常驻无限累积内存。 */
  private log(message: string): void {
    if (message.includes('\r')) {
      const lines = this.logs.split('\n');
      const clean = message.replace(/\r/g, '').trim();
      if (clean) lines[lines.length - 1] = clean;
      this.logs = lines.join('\n');
    } else {
      this.logs += message;
    }
    if (this.logs.length > 15000) this.logs = this.logs.slice(-10000);
    this.deps.onLog(message);
  }

  /** 将执行状态推送给界面；真实值始终属于主进程。 */
  private state(): DownloadState {
    const run = this.flow;
    return {
      busy: Boolean(run), downloading: Boolean(run?.running),
      paused: Boolean(run?.paused), checking: Boolean(run?.checking),
      detecting: Boolean(run?.detecting), total: run?.total ?? 0,
      completed: run?.completed ?? 0
    };
  }

  /** 通知窗口当前状态，但不要求窗口存在。 */
  private publish(): void {
    this.deps.onState(this.state());
  }

  /** 把任务加入当前独占流程，准备结束后由主进程统一执行。 */
  private enqueue(run: Flow, tasks: DownloadTask[]): void {
    if (run.stopped || this.flow !== run || tasks.length === 0) return;
    run.queue.push(...tasks);
    run.total += tasks.length;
    this.log(`\n>>> 📥 任务已入列（共 ${tasks.length} 个）...\n`);
    this.publish();
  }

  /** 结束准备阶段，仅在没有在途任务时释放执行权。 */
  private async prepare(run: Flow, action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      this.log(`>>> ❌ 流程执行失败: ${error instanceof Error ? error.message : String(error)}\n`);
    } finally {
      run.preparing = false;
      run.checking = false;
      run.detecting = false;
      this.publish();
      if (!run.stopped && run.queue.length > 0) void this.pump(run);
      else this.releaseIfIdle(run);
    }
  }

  /** 队列与准备阶段都已结束才允许新流程进入。 */
  private releaseIfIdle(run: Flow): void {
    if (this.flow !== run || run.preparing || run.running || run.queue.length > 0) return;
    if (!run.stopped && run.total > 0 && run.completed === run.total) {
      this.log('\n>>> 🟢 所有队列任务已执行完毕，等待新任务...\n');
      this.deps.onFinished();
    }
    this.flow = null;
    this.publish();
  }

  /** 主进程串行执行 BBDown，暂停与停止都须等待子进程退出。 */
  private async pump(run: Flow): Promise<void> {
    if (this.flow !== run || run.running || run.stopped || run.paused || run.preparing) return;
    run.running = true;
    try {
      while (!run.stopped && !run.paused && run.queue.length > 0) {
        const task = run.queue.shift()!;
        run.active = task;
        this.log(`\n>>> 🚀 开始下载: ${task.url}\n`);
        this.publish();
        let code: number | null = null;
        try {
          this.execution = this.deps.download(task, message => this.log(message));
          code = await this.execution.promise;
        } catch (error) {
          this.log(`>>> ❌ 下载执行失败: ${error instanceof Error ? error.message : String(error)}\n`);
        } finally {
          this.execution = null;
        }
        this.log(`\n====== 任务结束 (Code: ${code}) ======\n`);
        run.active = null;
        if (run.stopped) break;
        if (run.paused && code !== 0) {
          run.queue.unshift(task);
          break;
        }
        run.completed++;
        this.publish();
      }
    } finally {
      run.running = false;
      this.publish();
      this.releaseIfIdle(run);
    }
  }

  /** 手动下载与浏览器静默下载共用唯一队列；静默指令不弹确认框。 */
  startUrls(urls: string[], silent: boolean): boolean {
    if (!urls.length) return false;
    const run = this.begin();
    if (!run) return false;
    void this.prepare(run, async () => {
      const tasks = urls.map(url => ({ url, isSilent: silent }));
      if (silent) {
        this.enqueue(run, tasks);
        return;
      }
      run.checking = true;
      this.publish();
      this.log('\n>>> 🔍 正在预解析视频列表并检查下载历史，请稍候...\n');
      const all: DuplicateResult[] = [];
      try {
        for (const url of urls) {
          if (run.stopped) return;
          all.push(...await this.deps.inspect(url, message => this.log(message)));
        }
        if (run.stopped) return;
        const missing = all.filter(item => !item.isDownloaded);
        const existing = all.filter(item => item.isDownloaded);
        if (!all.length) {
          this.enqueue(run, tasks);
        } else if (!missing.length) {
          if (all.length === 1) {
            const item = all[0];
            const answer = await this.deps.confirmRedownload(item.title || item.bvid, item.bvid);
            if (run.stopped) return;
            if (answer) this.enqueue(run, tasks);
            else this.log(`\n>>> ⏭️ 已跳过：${item.bvid}\n`);
          } else {
            this.log(`\n>>> 🎉 所有 ${all.length} 个视频均已下载，无需重复下载。\n`);
          }
        } else {
          if (existing.length) this.log(`\n>>> ⏭️ 跳过 ${existing.length} 个已下载视频，正在下载 ${missing.length} 个新视频...\n`);
          this.enqueue(run, missing.map(item => ({ url: item.bvid, isSilent: false })));
        }
      } catch (error) {
        if (run.stopped) return;
        this.log(`>>> ⚠️ 预检查失败：${error instanceof Error ? error.message : String(error)}\n`);
        throw error;
      }
    });
    return true;
  }

  /** 按原逻辑查询默认收藏夹、清理已下载条目并下载未下载视频。 */
  startDefaultFavorites(): boolean {
    const run = this.begin();
    if (!run) return false;
    void this.prepare(run, async () => {
      run.detecting = true;
      this.publish();
      this.log('\n>>> 📂 正在获取默认收藏夹 ID...\n');
      const id = await this.deps.defaultFavoriteId();
      if (run.stopped) return;
      if (!id) {
        this.log('>>> ⚠️ 无法获取默认收藏夹 ID，请确保已登录。\n');
        return;
      }
      const favId = Number(id);
      this.log(`\n>>> ⏰ 开始扫描默认收藏夹 (ID: ${favId}) ...\n`);
      const results = await this.deps.inspect(String(favId), message => this.log(message));
      if (run.stopped) return;
      if (!results.length) {
        this.log('>>> ⚠️ 收藏夹为空或解析失败，本次自动下载跳过。\n');
        return;
      }
      const missing = results.filter(item => !item.isDownloaded);
      const downloaded = results.filter(item => item.isDownloaded);
      this.log(`>>> ✅ 扫描完成，发现 ${missing.length} 个未下载视频，正在加入下载队列...\n`);

      if (this.deps.getSettings().unfavAfterDownload && downloaded.length) {
        let removed = 0;
        for (let i = 0; i < downloaded.length; i++) {
          if (run.stopped) return;
          const item = downloaded[i];
          if (!item.aid) {
            this.log(`>>> [${i + 1}/${downloaded.length}] ⚠️ 跳过取消收藏 ${item.bvid}，原因：未能获取到 AID\n`);
            continue;
          }
          const result = await this.deps.remove(item.aid, favId);
          if (result.success) removed++;
          this.log(result.success
            ? `>>> [${i + 1}/${downloaded.length}] 🗑️ 已取消收藏: ${item.title || item.bvid}\n`
            : `>>> [${i + 1}/${downloaded.length}] ❌ 取消收藏失败: ${item.title || item.bvid} (${result.message || '未知错误'})\n`);
        }
        this.log(`>>> 🏁 默认收藏夹清理完毕。成功取消收藏: ${removed} 个，失败: ${downloaded.length - removed} 个。\n`);
      }
      if (run.stopped) return;
      if (!missing.length) {
        this.log('>>> 🎉 默认收藏夹中所有视频均已下载，无需重复下载。\n');
        return;
      }
      this.enqueue(run, missing.map(item => ({ url: item.bvid, isSilent: false, aid: item.aid, mediaId: favId })));
    });
    return true;
  }

  /** 收藏夹检测属于独占操作，返回时不得公布已停止流程的结果。 */
  async detect(url: string): Promise<DuplicateResult[] | null> {
    const run = this.begin();
    if (!run) return null;
    let result: DuplicateResult[] | null = null;
    await this.prepare(run, async () => {
      run.detecting = true;
      this.publish();
      this.log('\n>>> 🔍 正在深度扫描收藏夹全量列表，请稍候...\n');
      const items = await this.deps.inspect(url, message => this.log(message));
      if (run.stopped) return;
      result = items;
      this.log(items.length ? `>>> ✅ 扫描完成，发现 ${items.filter(item => !item.isDownloaded).length} 个未下载视频。\n` : '>>> ⚠️ 未能解析有效的视频列表。\n');
    });
    return result;
  }

  /** 收藏夹转存也由同一个控制器持有执行权，避免与下载互相重入。 */
  startCollect(items: DuplicateResult[]): boolean {
    const run = this.begin();
    if (!run) return false;
    void this.prepare(run, async () => {
      run.detecting = true;
      this.publish();
      const id = await this.deps.defaultFavoriteId();
      if (run.stopped) return;
      if (!id) throw new Error('未能获取默认收藏夹 ID，请确认是否已登录');
      let success = 0;
      for (let i = 0; i < items.length; i++) {
        if (run.stopped) return;
        const item = items[i];
        if (!item.aid) {
          this.log(`>>> [${i + 1}/${items.length}] ⚠️ 跳过 ${item.bvid}: 未能获取到 AID\n`);
          continue;
        }
        const result = await this.deps.collect(item.aid, id);
        if (result.success) success++;
        this.log(result.success
          ? `>>> [${i + 1}/${items.length}] ✅ 已转存: ${item.title}\n`
          : `>>> [${i + 1}/${items.length}] ❌ 转存失败: ${item.title} (${result.message})\n`);
      }
      this.log(`>>> 🏁 转存处理完毕。成功: ${success}，失败: ${items.length - success}。\n`);
    });
    return true;
  }

  /** 暂停保留队列，等待当前 BBDown 完成或退出再允许恢复。 */
  pause(): void {
    const run = this.flow;
    if (!run?.running || !run.active || run.paused) return;
    run.paused = true;
    this.execution?.cancel();
    this.log('\n>>> ⏸️ 下载已暂停。\n');
    this.publish();
  }

  /** 只有当前子进程已经结束才能继续待执行任务。 */
  resume(): void {
    const run = this.flow;
    if (!run?.paused || run.running) return;
    run.paused = false;
    this.log('\n>>> ▶️ 下载已恢复。\n');
    this.publish();
    if (run.queue.length) void this.pump(run);
    else this.releaseIfIdle(run);
  }

  /** 标记停止并清空剩余任务；在途操作归还执行权前不能启动新流程。 */
  stop(): void {
    const run = this.flow;
    if (!run || run.stopped) return;
    run.stopped = true;
    run.queue.length = 0;
    run.paused = false;
    this.deps.cancelConfirmation();
    this.execution?.cancel();
    this.log('\n>>> ⏹️ 已停止后续任务，等待当前操作结束。\n');
    this.publish();
    this.releaseIfIdle(run);
  }
}
