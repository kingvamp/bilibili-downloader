/// <reference types="vite/client" />
/// <reference types="vite-plugin-electron/renderer" />

interface IElectronAPI {
  startDownload: (url: string, isBatch?: boolean, dlSub?: boolean, downloadDir?: string, isSilent?: boolean, isMultiThread?: boolean) => void;
  stopDownload: () => void;
  onProgress: (callback: (data: string) => void) => void;
  onComplete: (callback: (code: number) => void) => void;
  getQRCode: () => Promise<{ success: boolean; imgData?: string; key?: string; error?: string }>;
  checkLogin: (key: string) => Promise<{ status: string; msg?: string }>;
  getUserInfo: () => Promise<{ isLogin: boolean; uname?: string; face?: string; mid?: number }>;
  logout: () => Promise<{ success: boolean }>;
  getDefaultFavId: () => Promise<number | null>;
  collectToFavFolder: (aid: number, folderId: number) => Promise<{ success: boolean; message?: string }>;
  checkDownloadHistory: (url: string) => Promise<{ bvid: string; aid?: number; title: string; isDownloaded: boolean }[]>;
  openExternal: (url: string) => void;
  
  selectFolder: () => Promise<string | null>;
  scanFolderForHistory: () => Promise<{ success: boolean, message?: string, foundCount?: number, addedCount?: number, totalInHistory?: number }>;
  getHistoryCount: () => Promise<number>;
  setClipboardMonitor: (state: boolean) => void;
  setCloseToTray: (state: boolean) => void;
  setNotifyState: (state: boolean) => void;
  setSoundState: (state: boolean) => void;
  notifyQueueDone: () => void;

  // 每日自动下载
  getLastTriggeredTime: () => Promise<number>;
  setAutoDownloadFav: (enabled: boolean) => void;
  onScheduledFavDownload: (callback: (favId: string | null, message: string | null) => void) => void;
  
  onClipboardMatch: (callback: (url: string) => void) => void;
  onSilentClipboardMatch: (callback: (url: string) => void) => void; 
  onOpenSettings: (callback: () => void) => void;
  
  minWindow: () => void;
  maxWindow: () => void;
  closeWindow: () => void;
}

interface Window {
  api: IElectronAPI;
}
