import { BrowserWindow, Tray, app } from 'electron';
import path from 'path';

export interface AppState {
  mainWindow: BrowserWindow | null;
  tray: Tray | null;
  lastClipboardText: string;
  isQuitting: boolean;
}

export const state: AppState = {
  mainWindow: null,
  tray: null,
  lastClipboardText: '',
  isQuitting: false,
};

export const AppPaths = {
  get historyPath() { return path.join(app.getPath('userData'), 'download_history.txt'); }
};
