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
  /** 是否开启每日自动下载默认收藏夹 */
  autoDownloadFav: boolean;
  /** 下载完成后自动从收藏夹移除视频（仅限默认收藏夹下载流程） */
  unfavAfterDownload: boolean;
}

export interface DownloadTask {
  url: string;
  isSilent: boolean;
  /** 视频 AV 号，用于下载完成后取消收藏 */
  aid?: number;
  /** 收藏夹 Media ID，用于下载完成后取消收藏 */
  mediaId?: number;
}

export interface DuplicateResult {
  bvid: string;
  aid?: number;
  title: string;
  isDownloaded: boolean;
}
