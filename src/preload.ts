import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

contextBridge.exposeInMainWorld('api', {
  startDownload: (url: string, isBatch: boolean = false, dlSub: boolean = false, downloadDir: string = '', isSilent: boolean = false, isMultiThread: boolean = false) => 
      ipcRenderer.send('start-download', url, isBatch, dlSub, downloadDir, isSilent, isMultiThread),
  
  onProgress: (callback: (data: string) => void) => {
    ipcRenderer.removeAllListeners('download-progress');
    ipcRenderer.on('download-progress', (_event: IpcRendererEvent, value: string) => callback(value));
  },
  onComplete: (callback: (code: number) => void) => {
    ipcRenderer.removeAllListeners('download-complete');
    ipcRenderer.on('download-complete', (_event: IpcRendererEvent, value: number) => callback(value));
  },
  
  getQRCode: () => ipcRenderer.invoke('get-qrcode'),
  checkLogin: (key: string) => ipcRenderer.invoke('check-login', key),
  getUserInfo: () => ipcRenderer.invoke('get-user-info'),
  
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  setClipboardMonitor: (state: boolean) => ipcRenderer.send('set-clipboard-monitor', state),
  setCloseToTray: (state: boolean) => ipcRenderer.send('set-close-to-tray', state),
  setNotifyState: (state: boolean) => ipcRenderer.send('set-notify-state', state),
  setSoundState: (state: boolean) => ipcRenderer.send('set-sound-state', state),
  
  // 【新增】通知后端整个队列已全部完成
  notifyQueueDone: () => ipcRenderer.send('queue-finished'),
  
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