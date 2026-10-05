export interface Settings {
  downloadDir: string;
  clipboardMonitor: boolean;
  dlSub: boolean;
  multiThread: boolean;
  closeToTray: boolean;
  notifyState: boolean;
  soundState: boolean;
  autoDownloadFav: boolean;
  unfavAfterDownload: boolean;
}

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
