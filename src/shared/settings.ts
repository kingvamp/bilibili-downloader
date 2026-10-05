// 共享设置契约：主进程唯一持久化，渲染进程通过 IPC 读取和提交。
export interface Settings {
  downloadDir: string;
  clipboardMonitor: boolean;
  dlSub: boolean;
  multiThread: boolean;
  closeToTray: boolean;
  notifyState: boolean;
  soundState: boolean;
  /** 是否开启自动下载默认收藏夹。 */
  autoDownloadFav: boolean;
  /** 仅默认收藏夹流程在下载后移除收藏。 */
  unfavAfterDownload: boolean;
}

export type SaveSettingsResult =
  | { success: true; settings: Settings }
  | { success: false; message: string };

export const DEFAULT_SETTINGS: Settings = {
  downloadDir: './downloads',
  clipboardMonitor: false,
  dlSub: false,
  multiThread: false,
  closeToTray: true,
  notifyState: true,
  soundState: false,
  autoDownloadFav: false,
  unfavAfterDownload: false
};
