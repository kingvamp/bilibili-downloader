// Electron 渲染进程接口声明：与 preload.ts 暴露的 IPC 桥保持一致。
// TypeScript 类型声明文件：定义 Electron API 接口类型以支持渲染进程的类型安全和自动补全。
/// <reference types="vite/client" />
/// <reference types="vite-plugin-electron/renderer" />

interface IElectronAPI {
  startDownload: (url: string, isBatch?: boolean, isSilent?: boolean, aid?: number, mediaId?: number) => void;
  stopDownload: () => void;
  onProgress: (callback: (data: string) => void) => void;
  onComplete: (callback: (code: number | null) => void) => void;
  getQRCode: () => Promise<{ success: boolean; imgData?: string; key?: string; error?: string }>;
  checkLogin: (key: string) => Promise<{ status: string; msg?: string }>;
  getUserInfo: () => Promise<{ isLogin: boolean; uname?: string; face?: string; mid?: number }>;
  logout: () => Promise<{ success: boolean }>;
  getDefaultFavId: () => Promise<number | null>;
  collectToFavFolder: (aid: number, folderId: number) => Promise<{ success: boolean; message?: string }>;
  removeFromFavFolder: (aid: number, folderId: number) => Promise<{ success: boolean; message?: string }>;
  checkDownloadHistory: (url: string) => Promise<{ bvid: string; aid?: number; title: string; isDownloaded: boolean }[]>;
  openExternal: (url: string) => void;
  
  selectFolder: () => Promise<string | null>;
  scanFolderForHistory: () => Promise<{ success: boolean, message?: string, foundCount?: number, addedCount?: number, totalInHistory?: number }>;
  getHistoryCount: () => Promise<number>;
  getSettings: () => Promise<import('./shared/settings').Settings>;
  saveSettings: (settings: import('./shared/settings').Settings) => Promise<import('./shared/settings').SaveSettingsResult>;
  notifyQueueDone: () => void;

  // 每日自动下载
  getLastTriggeredTime: () => Promise<number>;
  onScheduledFavDownload: (callback: (message: string | null) => void) => void;
  
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
