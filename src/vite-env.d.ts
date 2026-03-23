/// <reference types="vite/client" />
/// <reference types="vite-plugin-electron/renderer" />

interface IElectronAPI {
  startDownload: (url: string, isBatch?: boolean, dlSub?: boolean, downloadDir?: string, isSilent?: boolean, isMultiThread?: boolean) => void;
  onProgress: (callback: (data: string) => void) => void;
  onComplete: (callback: (code: number) => void) => void;
  getQRCode: () => Promise<{ success: boolean; imgData?: string; key?: string; error?: string }>;
  checkLogin: (key: string) => Promise<{ status: string; msg?: string }>;
  getUserInfo: () => Promise<{ isLogin: boolean; uname?: string; face?: string; mid?: number }>;
  getDefaultFavId: () => Promise<number | null>;
  openExternal: (url: string) => void;
  
  selectFolder: () => Promise<string | null>;
  setClipboardMonitor: (state: boolean) => void;
  setCloseToTray: (state: boolean) => void;
  setNotifyState: (state: boolean) => void;
  setSoundState: (state: boolean) => void;
  notifyQueueDone: () => void;
  
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
