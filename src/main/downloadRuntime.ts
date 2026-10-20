// 主进程下载服务：连接统一控制器与 Electron IPC、真实 BBDown 和 B 站 API。
// 关联：main.ts 启动服务；scheduler.ts/clipboard.ts 发送指令；preload.ts 订阅状态。
import { ipcMain, Notification, shell } from 'electron';
import { state } from './state';
import { getSettings } from './settings';
import { getDefaultFavoriteId, collectToFavorite, removeFromFavFolder } from './api';
import { inspectHistory, executeDownload } from './downloader';
import { DownloadManager } from './downloadManager';
import type { DownloadState, DuplicateResult } from '../shared/download';

let pendingConfirm: ((answer: boolean) => void) | null = null;
let confirmation: {title:string;bvid:string} | null = null;
let manager: DownloadManager | null = null;

/** 将状态和日志广播给当前打开的 UI，无窗口不影响实际工作流。 */
function notify(channel: string, value: unknown): void {
  if (state.mainWindow && !state.mainWindow.isDestroyed() && !state.mainWindow.webContents.isDestroyed()) {
    state.mainWindow.webContents.send(channel, value);
  }
}

/** 用户确认只影响当前等待的手动任务，停止时立即释放。 */
function confirmRedownload(title: string, bvid: string): Promise<boolean> {
  return new Promise(resolve => {
    pendingConfirm = resolve;
    confirmation = {title, bvid};
    notify('manager-confirm', confirmation);
  });
}

/** 终止当前确认，禁止等待用户的流程一直占用执行权。 */
export function cancelPendingConfirmation(): void {
  const resolve = pendingConfirm;
  pendingConfirm = null;
  confirmation = null;
  notify('manager-confirm', null);
  resolve?.(false);
}

/** 提供由主进程持有的唯一工作流状态。 */
export function getDownloadManager(): DownloadManager {
  if (!manager) throw new Error('下载流程服务未初始化');
  return manager;
}

/** 在主进程中注册下载操作及 UI 观察事件。 */
export function setupDownloadRuntime(): void {
  if (manager) throw new Error('下载流程服务重复初始化');
  manager = new DownloadManager({
    getSettings,
    defaultFavoriteId: getDefaultFavoriteId,
    inspect: inspectHistory,
    download: executeDownload,
    remove: removeFromFavFolder,
    collect: collectToFavorite,
    confirmRedownload,
    cancelConfirmation: cancelPendingConfirmation,
    onState: (snapshot: DownloadState) => notify('manager-state', snapshot),
    onLog: message => notify('manager-log', message),
    onFinished: () => {
      if (getSettings().notifyState && Notification.isSupported()) {
        new Notification({ title: '所有任务已下载完成', body: '批量下载队列已全部处理完毕' }).show();
      }
      if (getSettings().soundState) shell.beep();
      if (state.mainWindow && !state.mainWindow.isFocused()) state.mainWindow.flashFrame(true);
    }
  });

  ipcMain.handle('manager-snapshot', () => ({ ...getDownloadManager().snapshot(), confirmation }));
  ipcMain.handle('manager-start', (_event, urls: string[], silent: boolean) => getDownloadManager().startUrls(urls, silent));
  ipcMain.handle('manager-default', () => getDownloadManager().startDefaultFavorites());
  ipcMain.handle('manager-detect', (_event, url: string) => getDownloadManager().detect(url));
  ipcMain.handle('manager-collect', (_event, items: DuplicateResult[]) => getDownloadManager().startCollect(items));
  ipcMain.on('manager-pause', () => getDownloadManager().pause());
  ipcMain.on('manager-resume', () => getDownloadManager().resume());
  ipcMain.on('manager-stop', () => getDownloadManager().stop());
  ipcMain.on('manager-confirm-answer', (_event, answer: boolean) => {
    const resolve = pendingConfirm;
    pendingConfirm = null;
    confirmation = null;
    resolve?.(answer);
  });
}
