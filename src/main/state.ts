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
  /** 定时下载时间点，格式 "HH:mm"，空字符串表示禁用 */
  scheduledTime: string;
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
  scheduledTime: '',
};

export const AppPaths = {
  get cookiePath() { return path.join(app.getPath('userData'), 'cookie.txt'); },
  get historyPath() { return path.join(app.getPath('userData'), 'download_history.txt'); }
};
