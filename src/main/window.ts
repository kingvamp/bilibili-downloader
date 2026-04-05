import { app, BrowserWindow, ipcMain, Tray, Menu, shell, dialog } from 'electron';
import path from 'path';
import { state } from './state';

export function setupWindow() {
  createWindow();
  createTray();

  ipcMain.on('window-min', () => state.mainWindow?.hide());
  ipcMain.on('window-max', () => {
    if (state.mainWindow?.isMaximized()) state.mainWindow.unmaximize();
    else state.mainWindow?.maximize();
  });

  ipcMain.on('window-close', () => {
    if (state.isCloseToTray) {
      state.mainWindow?.hide(); 
    } else {
      state.isQuitting = true;  
      app.quit();         
    }
  });

  ipcMain.on('set-close-to-tray', (event, s) => {
    state.isCloseToTray = s;
  });

  ipcMain.on('set-notify-state', (event, s) => {
    state.isNotifyEnabled = s;
  });
  
  ipcMain.on('set-sound-state', (event, s) => {
    state.isSoundEnabled = s;
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

  state.mainWindow.on('close', (event) => {
    if (!state.isQuitting && state.isCloseToTray) {
      event.preventDefault(); 
      state.mainWindow?.hide();     
    }
  });
}

function createTray(): void {
  const iconPath = path.join(__dirname, '../icon.ico');
  state.tray = new Tray(iconPath);
  
  const contextMenu = Menu.buildFromTemplate([
      { label: '显示主界面', click: () => { state.mainWindow?.show(); state.mainWindow?.focus(); } },
      { label: '偏好设置', click: () => { 
          if (state.mainWindow) {
              if (state.mainWindow.isMinimized()) state.mainWindow.restore();
              if (!state.mainWindow.isVisible()) state.mainWindow.show();
              state.mainWindow.focus();
              state.mainWindow.webContents.send('open-settings'); 
          }
      } },
      { type: 'separator' },
      { label: '退出程序', click: () => { state.isQuitting = true; app.quit(); } }
  ]);
  
  state.tray.setToolTip('Bilibili Downloader');
  state.tray.setContextMenu(contextMenu);
  
  state.tray.on('double-click', () => {
      state.mainWindow?.show();
      state.mainWindow?.focus();
  });
}
