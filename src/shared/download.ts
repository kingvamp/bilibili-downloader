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

export interface DownloadState {
  busy: boolean;
  downloading: boolean;
  paused: boolean;
  checking: boolean;
  detecting: boolean;
  total: number;
  completed: number;
}
