// Electron 渲染进程接口声明：与 preload.ts 暴露的 IPC 桥保持一致。
// TypeScript 类型声明文件：定义 Electron API 接口类型以支持渲染进程的类型安全和自动补全。
/// <reference types="vite/client" />
/// <reference types="vite-plugin-electron/renderer" />

interface IElectronAPI {
  consumeUIIntents: () => Promise<{openSettings:boolean;clipboardUrl:string|null}>;
  getManagerSnapshot: () => Promise<{state:import('./shared/download').DownloadState;logs:string;confirmation:{title:string;bvid:string}|null}>;
  managerStart: (urls:string[],silent:boolean) => Promise<boolean>;
  managerDefault: () => Promise<boolean>;
  managerDetect: (url:string) => Promise<import('./shared/download').DuplicateResult[]|null>;
  managerCollect: (items:import('./shared/download').DuplicateResult[]) => Promise<boolean>;
  managerPause: () => void;
  managerResume: () => void;
  managerStop: () => void;
  managerAppendLog: (message: string) => void;
  managerClearLogs: () => void;
  managerConfirm: (answer:boolean) => void;
  onManagerState: (callback:(state:import('./shared/download').DownloadState)=>void) => void;
  onManagerLog: (callback:(logs:string)=>void) => void;
  onManagerConfirm: (callback:(value:{title:string;bvid:string}|null)=>void) => void;
  getQRCode: () => Promise<{ success: boolean; imgData?: string; key?: string; error?: string }>;
  checkLogin: (key: string) => Promise<{ status: string; msg?: string }>;
  getUserInfo: () => Promise<{ isLogin: boolean; uname?: string; face?: string; mid?: number }>;
  logout: () => Promise<{ success: boolean }>;
  openExternal: (url: string) => void;
  
  selectFolder: () => Promise<string | null>;
  scanFolderForHistory: () => Promise<{ success: true; foundCount: number; addedCount: number; totalInHistory: number } | { success: false; message: string }>;
  getHistoryCount: () => Promise<number>;
  getSettings: () => Promise<import('./shared/settings').Settings>;
  saveSettings: (settings: import('./shared/settings').Settings) => Promise<import('./shared/settings').SaveSettingsResult>;

  // 每小时自动下载
  getLastTriggeredTime: () => Promise<number>;
  
  onClipboardMatch: (callback: (url: string) => void) => void;
  onOpenSettings: (callback: () => void) => void;
  
  minWindow: () => void;
  maxWindow: () => void;
  closeWindow: () => void;
}

interface Window {
  api: IElectronAPI;
}
