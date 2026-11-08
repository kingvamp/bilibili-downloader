// 下载任务与状态的共享契约：Electron 主进程负责执行，React 只负责展示。
export interface DownloadTask {
  url: string;
  isSilent: boolean;
  aid?: number;
  mediaId?: number;
}

export interface DuplicateResult {
  bvid: string;
  aid?: number;
  title: string;
  isDownloaded: boolean;
}

/** 当前 BBDown 任务已确认的分P进度。 */
export interface DownloadProgress {
  current: number;
  total: number;
}

/** 执行结果包含历史同步和下载后的收藏操作，取消只针对当前执行实例。 */
export interface DownloadExecution {
  promise: Promise<number | null>;
  cancel(): void;
}

export interface DownloadState {
  busy: boolean;
  downloading: boolean;
  paused: boolean;
  checking: boolean;
  detecting: boolean;
  total: number;
  completed: number;
  subProgress: DownloadProgress | null;
}
