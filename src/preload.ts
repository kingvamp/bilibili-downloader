// Preload 脚本：安全地向渲染进程暴露 Electron 的 IPC 接口（如下载控制、B站API、窗口操作等）。
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type { DownloadState, DuplicateResult } from './shared/download';

contextBridge.exposeInMainWorld('api', {
  consumeUIIntents: () => ipcRenderer.invoke('consume-ui-intents'),
  getManagerSnapshot: () => ipcRenderer.invoke('manager-snapshot'),
  managerStart: (urls: string[], silent: boolean) => ipcRenderer.invoke('manager-start', urls, silent),
  managerDefault: () => ipcRenderer.invoke('manager-default'),
  managerDetect: (url: string) => ipcRenderer.invoke('manager-detect', url),
  managerCollect: (items: DuplicateResult[]) => ipcRenderer.invoke('manager-collect', items),
  managerPause: () => ipcRenderer.send('manager-pause'),
  managerResume: () => ipcRenderer.send('manager-resume'),
  managerStop: () => ipcRenderer.send('manager-stop'),
  managerAppendLog: (message: string) => ipcRenderer.send('manager-append-log', message),
  managerClearLogs: () => ipcRenderer.send('manager-clear-logs'),
  managerConfirm: (answer: boolean) => ipcRenderer.send('manager-confirm-answer', answer),
  onManagerState: (callback: (state: DownloadState) => void) => {
    ipcRenderer.removeAllListeners('manager-state');
    ipcRenderer.on('manager-state', (_event, value) => callback(value));
  },
  onManagerLog: (callback: (logs: string) => void) => {
    ipcRenderer.removeAllListeners('manager-log');
    ipcRenderer.on('manager-log', (_event, value) => callback(value));
  },
  onManagerConfirm: (callback: (value: {title: string; bvid: string} | null) => void) => {
    ipcRenderer.removeAllListeners('manager-confirm');
    ipcRenderer.on('manager-confirm', (_event, value) => callback(value));
  },
  openExternal: (url: string) => ipcRenderer.send('open-external', url),
  
  getQRCode: () => ipcRenderer.invoke('get-qrcode'),
  checkLogin: (key: string) => ipcRenderer.invoke('check-login', key),

  getUserInfo: () => ipcRenderer.invoke('get-user-info'),
  logout: () => ipcRenderer.invoke('logout'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  scanFolderForHistory: () => ipcRenderer.invoke('scan-folder-for-history'),
  getHistoryCount: () => ipcRenderer.invoke('get-history-count'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: unknown) => ipcRenderer.invoke('save-settings', settings),
  
  getLastTriggeredTime: () => ipcRenderer.invoke('get-last-triggered-time'),

  onClipboardMatch: (callback: (url: string) => void) => {
    ipcRenderer.removeAllListeners('clipboard-match');
    ipcRenderer.on('clipboard-match', (_event: IpcRendererEvent, value: string) => callback(value));
  },

  onOpenSettings: (callback: () => void) => {
    ipcRenderer.removeAllListeners('open-settings');
    ipcRenderer.on('open-settings', () => callback());
  },

  minWindow: () => ipcRenderer.send('window-min'),
  maxWindow: () => ipcRenderer.send('window-max'),
  closeWindow: () => ipcRenderer.send('window-close')
});
