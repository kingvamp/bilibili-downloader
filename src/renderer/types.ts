export interface UserInfo {
  isLogin: boolean;
  uname?: string;
  face?: string;
  mid?: number;
}

export type { Settings } from '../shared/settings';

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
