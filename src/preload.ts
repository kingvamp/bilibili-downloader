import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

contextBridge.exposeInMainWorld('api', {
  // 【修改】增加 isSilent 参数
  startDownload: (url: string, isBatch: boolean = false, dlSub: boolean = false, downloadDir: string = '', isSilent: boolean = false) => 
      ipcRenderer.send('start-download', url, isBatch, dlSub, downloadDir, isSilent),
  
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