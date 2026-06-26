export interface UserInfo {
  isLogin: boolean;
  uname?: string;
  face?: string;
  mid?: number;
}

export interface Settings {
  downloadDir: string;
  clipboardMonitor: boolean;
  dlSub: boolean;
  multiThread: boolean;
  closeToTray: boolean;
  notifyState: boolean;
  soundState: boolean;
  /** 定时自动下载默认收藏夹的时间点，格式 "HH:mm"，空字符串表示禁用 */
  scheduledTime: string;
}

export interface DownloadTask {
  url: string;
  isSilent: boolean;
}

export interface DuplicateResult {
  bvid: string;
  aid?: number;
  title: string;
  isDownloaded: boolean;
}
