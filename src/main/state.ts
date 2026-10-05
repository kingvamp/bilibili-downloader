import { BrowserWindow, Tray, app } from 'electron';
import { ChildProcess } from 'child_process';
import path from 'path';

export interface AppState {
  mainWindow: BrowserWindow | null;
  tray: Tray | null;
  sessionCookie: string;
  isNormalClipboardMonitoring: boolean;
  lastClipboardText: string;
  isQuitting: boolean;
  isCloseToTray: boolean;
  isNotifyEnabled: boolean;
  isSoundEnabled: boolean;
  currentChild: ChildProcess | null;
  /** 是否开启每日自动下载默认收藏夹 */
  autoDownloadFav: boolean;
  /** 下载完成后自动从收藏夹移除视频（仅限默认收藏夹下载流程） */
  unfavAfterDownload: boolean;
}

export const state: AppState = {
  mainWindow: null,
  tray: null,
  sessionCookie: '',
  isNormalClipboardMonitoring: false,
  lastClipboardText: '',
  isQuitting: false,
  isCloseToTray: true,
  isNotifyEnabled: true,
  isSoundEnabled: false,
  currentChild: null,
  autoDownloadFav: false,
  unfavAfterDownload: false,
};

export const AppPaths = {
  get historyPath() { return path.join(app.getPath('userData'), 'download_history.txt'); }
};
