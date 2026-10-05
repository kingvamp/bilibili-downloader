// Preload 脚本：安全地向渲染进程暴露 Electron 的 IPC 接口（如下载控制、B站API、窗口操作等）。
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

contextBridge.exposeInMainWorld('api', {
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
