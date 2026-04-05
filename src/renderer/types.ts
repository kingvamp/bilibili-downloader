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
