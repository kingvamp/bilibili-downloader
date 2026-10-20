// Preload 脚本：安全地向渲染进程暴露 Electron 的 IPC 接口（如下载控制、B站API、窗口操作等）。
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

contextBridge.exposeInMainWorld('api', {
  consumeUIIntents: () => ipcRenderer.invoke('consume-ui-intents'),
  getManagerSnapshot: () => ipcRenderer.invoke('manager-snapshot'),
  managerStart: (urls: string[], silent: boolean) => ipcRenderer.invoke('manager-start', urls, silent),
  managerDefault: () => ipcRenderer.invoke('manager-default'),
  managerDetect: (url: string) => ipcRenderer.invoke('manager-detect', url),
  managerCollect: (items: unknown[]) => ipcRenderer.invoke('manager-collect', items),
  managerPause: () => ipcRenderer.send('manager-pause'),
  managerResume: () => ipcRenderer.send('manager-resume'),
  managerStop: () => ipcRenderer.send('manager-stop'),
  managerConfirm: (answer: boolean) => ipcRenderer.send('manager-confirm-answer', answer),
  onManagerState: (callback: (state: unknown) => void) => {
    ipcRenderer.removeAllListeners('manager-state');
    ipcRenderer.on('manager-state', (_event, value) => callback(value));
  },
  onManagerLog: (callback: (message: string) => void) => {
    ipcRenderer.removeAllListeners('manager-log');
    ipcRenderer.on('manager-log', (_event, value) => callback(value));
  },
  onManagerConfirm: (callback: (value: unknown) => void) => {
    ipcRenderer.removeAllListeners('manager-confirm');
    ipcRenderer.on('manager-confirm', (_event, value) => callback(value));
  },
  startDownload: (url: string, isBatch: boolean = false, isSilent: boolean = false, aid?: number, mediaId?: number) =>
      ipcRenderer.send('start-download', url, isBatch, isSilent, aid, mediaId),
  checkDownloadHistory: (url: string) => ipcRenderer.invoke('check-download-history', url),
  stopDownload: () => ipcRenderer.send('stop-download'),
  
  onProgress: (callback: (data: string) => void) => {
    ipcRenderer.removeAllListeners('download-progress');
    ipcRenderer.on('download-progress', (_event: IpcRendererEvent, value: string) => callback(value));
  },
  onComplete: (callback: (code: number | null) => void) => {
    ipcRenderer.removeAllListeners('download-complete');
    ipcRenderer.on('download-complete', (_event: IpcRendererEvent, value: number | null) => callback(value));
  },
  openExternal: (url: string) => ipcRenderer.send('open-external', url),
  
  getQRCode: () => ipcRenderer.invoke('get-qrcode'),
  checkLogin: (key: string) => ipcRenderer.invoke('check-login', key),

  getUserInfo: () => ipcRenderer.invoke('get-user-info'),
  logout: () => ipcRenderer.invoke('logout'),
  getDefaultFavId: () => ipcRenderer.invoke('get-default-fav-id'),
  collectToFavFolder: (aid: number, folderId: number) => ipcRenderer.invoke('collect-to-fav-folder', aid, folderId),
  removeFromFavFolder: (aid: number, folderId: number) => ipcRenderer.invoke('remove-from-fav-folder', aid, folderId),

  
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  scanFolderForHistory: () => ipcRenderer.invoke('scan-folder-for-history'),
  getHistoryCount: () => ipcRenderer.invoke('get-history-count'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: unknown) => ipcRenderer.invoke('save-settings', settings),
  
  // 【新增】通知后端整个队列已全部完成
  notifyQueueDone: () => ipcRenderer.send('queue-finished'),

  // 【新增】每日自动下载配置
  getLastTriggeredTime: () => ipcRenderer.invoke('get-last-triggered-time'),
  onScheduledFavDownload: (callback: (message: string | null) => void) => {
    ipcRenderer.removeAllListeners('scheduled-fav-download');
    ipcRenderer.on('scheduled-fav-download', (_event: IpcRendererEvent, message: string | null) => callback(message));
  },
  
  onClipboardMatch: (callback: (url: string) => void) => {
    ipcRenderer.removeAllListeners('clipboard-match');
    ipcRenderer.on('clipboard-match', (_event: IpcRendererEvent, value: string) => callback(value));
  },

  onSilentClipboardMatch: (callback: (url: string) => void) => {
    ipcRenderer.removeAllListeners('silent-clipboard-match');
    ipcRenderer.on('silent-clipboard-match', (_event: IpcRendererEvent, value: string) => callback(value));
  },

  onOpenSettings: (callback: () => void) => {
    ipcRenderer.removeAllListeners('open-settings');
    ipcRenderer.on('open-settings', () => callback());
  },

  minWindow: () => ipcRenderer.send('window-min'),
  maxWindow: () => ipcRenderer.send('window-max'),
  closeWindow: () => ipcRenderer.send('window-close')
});
