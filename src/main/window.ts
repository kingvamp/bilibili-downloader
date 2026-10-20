import { app, BrowserWindow, ipcMain, Tray, Menu, shell, dialog } from 'electron';
import path from 'path';
import { state } from './state';
import { getSetting } from './settings';
import { cancelPendingConfirmation } from './downloadRuntime';

// 新窗口尚未完成 React 挂载时，跨进程交互意图由主进程保留。
let pendingSettings = false;
let pendingClipboard: string | null = null;

export function setupWindow() {
  createWindow();
  createTray();
  // 关闭到托盘时可以没有 BrowserWindow，后台调度和下载依然运行。
  app.on('window-all-closed', () => {
    if (!getSetting('closeToTray')) app.quit();
  });

  ipcMain.handle('consume-ui-intents', () => {
    const result = { openSettings: pendingSettings, clipboardUrl: pendingClipboard };
    pendingSettings = false;
    pendingClipboard = null;
    return result;
  });

  ipcMain.on('window-min', () => state.mainWindow?.hide());
  ipcMain.on('window-max', () => {
    if (state.mainWindow?.isMaximized()) state.mainWindow.unmaximize();
    else state.mainWindow?.maximize();
  });

  ipcMain.on('window-close', () => {
    if (getSetting('closeToTray')) {
      state.mainWindow?.close();
    } else {
      state.isQuitting = true;  
      app.quit();         
    }
  });


  ipcMain.on('open-external', (event, url) => {
    shell.openExternal(url);
  });

  ipcMain.handle('select-folder', async () => {
    if (!state.mainWindow) return null;
    const { canceled, filePaths } = await dialog.showOpenDialog(state.mainWindow, {
        title: '选择下载保存目录',
        properties: ['openDirectory', 'createDirectory'] 
    });
    if (!canceled && filePaths.length > 0) {
        return filePaths[0];
    }
    return null;
  });
}

/** 激活主界面：窗口已被销毁则重新创建，并从主进程恢复任务状态。 */
/** 让剪贴板唤醒在窗口销毁后仍能可靠传递到新建 React 界面。 */
export function openClipboardWindow(url: string): void {
  const ready = Boolean(state.mainWindow && !state.mainWindow.isDestroyed() && !state.mainWindow.webContents.isLoading());
  if (!ready) pendingClipboard = url;
  openMainWindow();
  if (ready) state.mainWindow?.webContents.send('clipboard-match', url);
}

/** 打开偏好设置，新建窗口时由 React 主动领取打开意图。 */
function openSettingsWindow(): void {
  const ready = Boolean(state.mainWindow && !state.mainWindow.isDestroyed() && !state.mainWindow.webContents.isLoading());
  if (!ready) pendingSettings = true;
  openMainWindow();
  if (ready) state.mainWindow?.webContents.send('open-settings');
}

export function openMainWindow(): void {
  if (!state.mainWindow || state.mainWindow.isDestroyed()) createWindow();
  if (state.mainWindow?.isMinimized()) state.mainWindow.restore();
  state.mainWindow?.show();
  state.mainWindow?.focus();
}

/** 构建新的 Chromium 窗口；关闭到托盘时只释放窗口，不退出后台进程。 */
function createWindow(): void {
  state.mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    frame: false, 
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    state.mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    state.mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  state.mainWindow.on('focus', () => {
      state.mainWindow?.flashFrame(false);
  });

  state.mainWindow.on('closed', () => {
    // 主界面关闭后不允许未回答的重复下载确认阻塞后台自动扫描。
    cancelPendingConfirmation();
    state.mainWindow = null;
  });
}

function createTray(): void {
  const iconPath = path.join(__dirname, '../icon.ico');
  state.tray = new Tray(iconPath);
  
  const contextMenu = Menu.buildFromTemplate([
      { label: '显示主界面', click: openMainWindow },
      { label: '偏好设置', click: openSettingsWindow },
      { type: 'separator' },
      { label: '退出程序', click: () => { state.isQuitting = true; app.quit(); } }
  ]);
  
  state.tray.setToolTip('Bilibili Downloader');
  state.tray.setContextMenu(contextMenu);
  
  state.tray.on('double-click', openMainWindow);
}
