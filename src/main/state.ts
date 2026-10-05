import { BrowserWindow, Tray, app } from 'electron';
import { ChildProcess } from 'child_process';
import path from 'path';

export interface AppState {
  mainWindow: BrowserWindow | null;
  tray: Tray | null;
  sessionCookie: string;
  lastClipboardText: string;
  isQuitting: boolean;
  currentChild: ChildProcess | null;
}

export const state: AppState = {
  mainWindow: null,
  tray: null,
  sessionCookie: '',
  lastClipboardText: '',
  isQuitting: false,
  currentChild: null,
};

export const AppPaths = {
  get historyPath() { return path.join(app.getPath('userData'), 'download_history.txt'); }
};
