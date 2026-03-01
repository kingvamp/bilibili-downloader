import { app, BrowserWindow, ipcMain, Tray, Menu, clipboard, dialog } from 'electron';
import path from 'path';
import { spawn } from 'child_process';
import axios from 'axios';
import QRCode from 'qrcode';
import fs from 'fs';
import { autoUpdater } from 'electron-updater';

const clipboardListener = require('clipboard-event');

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let sessionCookie: string = '';
const cookiePath = path.join(app.getPath('userData'), 'cookie.txt');

let isNormalClipboardMonitoring = false; 
let lastClipboardText = '';
let isQuitting = false; 

function loadCookie(): void {
  try {
    if (fs.existsSync(cookiePath)) {
      sessionCookie = fs.readFileSync(cookiePath, 'utf-8').trim();
    }
  } catch (e) { console.error(e); }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
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

  mainWindow.loadFile(path.join(__dirname, '../index.html'));

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault(); 
      mainWindow?.hide();     
    }
  });
}

function createTray(): void {
  const iconPath = path.join(__dirname, '../icon.ico');
  tray = new Tray(iconPath);
  
  const contextMenu = Menu.buildFromTemplate([
      { label: '显示主界面', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
      { label: '偏好设置', click: () => { 
          if (mainWindow) {
              if (mainWindow.isMinimized()) mainWindow.restore();
              if (!mainWindow.isVisible()) mainWindow.show();
              mainWindow.focus();
              mainWindow.webContents.send('open-settings'); 
          }
      } },
      { type: 'separator' },
      { label: '退出程序', click: () => { isQuitting = true; app.quit(); } }
  ]);
  
  tray.setToolTip('Bilibili Downloader');
  tray.setContextMenu(contextMenu);
  
  tray.on('double-click', () => {
      mainWindow?.show();
      mainWindow?.focus();
  });
}

clipboardListener.on('change', () => {
  const text = clipboard.readText().trim();
  
  if (text !== lastClipboardText && text !== '') {
      lastClipboardText = text;
      
      if (text.startsWith('Enhancer_Download||')) {
          const targetUrl = text.split('||')[1]?.trim();
          if (targetUrl && mainWindow) {
              mainWindow.webContents.send('silent-clipboard-match', targetUrl);
          }
          return; 
      }

      if (isNormalClipboardMonitoring) {
          if (/bilibili\.com|b23\.tv/i.test(text)) {
              if (mainWindow) {
                  if (mainWindow.isMinimized()) mainWindow.restore();
                  if (!mainWindow.isVisible()) mainWindow.show();
                  mainWindow.focus();
                  mainWindow.webContents.send('clipboard-match', text);
              }
          }
      }
  }
});

app.whenReady().then(() => {
  loadCookie();
  createWindow();
  createTray();
  clipboardListener.startListening();

  autoUpdater.autoDownload = true; 
  autoUpdater.autoInstallOnAppQuit = true; 

  autoUpdater.on('checking-for-update', () => {
      mainWindow?.webContents.send('download-progress', '>>> 🔄 正在连接 GitHub 检测软件更新...\n');
  });
  
  autoUpdater.on('update-available', (info) => {
      mainWindow?.webContents.send('download-progress', `>>> ✨ 发现新版本 v${info.version}！正在后台静默下载，请稍候...\n`);
  });
  
  autoUpdater.on('update-not-available', () => {
      mainWindow?.webContents.send('download-progress', '>>> ✅ 当前软件已是最新版本。\n');
  });
  
  autoUpdater.on('update-downloaded', () => {
      mainWindow?.webContents.send('download-progress', '>>> 🎉 新版本后台下载完成！将在下次彻底退出并重启软件时自动完成升级。\n');
  });

  autoUpdater.on('error', (err) => {
      mainWindow?.webContents.send('download-progress', `>>> ⚠️ 检查更新失败: ${err.message}\n`);
  });

  setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify();
  }, 3000);
});

app.on('will-quit', () => {
  try {
      clipboardListener.stopListening();
  } catch (e) {}
});

ipcMain.on('window-min', () => mainWindow?.hide());
ipcMain.on('window-max', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window-close', () => mainWindow?.hide());

ipcMain.on('set-clipboard-monitor', (event, state) => {
  isNormalClipboardMonitoring = state;
  if (state) lastClipboardText = '';
});

ipcMain.handle('select-folder', async () => {
  if (!mainWindow) return null;
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: '选择下载保存目录',
      properties: ['openDirectory', 'createDirectory'] 
  });
  if (!canceled && filePaths.length > 0) {
      return filePaths[0];
  }
  return null;
});

ipcMain.handle('get-user-info', async () => {
  if (!sessionCookie) return { isLogin: false };
  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36',
      'Cookie': sessionCookie
    };
    const res = await axios.get('https://api.bilibili.com/x/web-interface/nav', { headers });
    if (res.data.code === 0 && res.data.data.isLogin) {
      return { isLogin: true, uname: res.data.data.uname, face: res.data.data.face };
    }
    return { isLogin: false };
  } catch (e: any) { return { isLogin: false, error: e.message }; }
});

ipcMain.handle('get-qrcode', async () => {
  try {
    const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36' };
    const res = await axios.get('https://passport.bilibili.com/x/passport-login/web/qrcode/generate', { headers });
    const { url, qrcode_key } = res.data.data;
    const dataURL = await QRCode.toDataURL(url);
    return { success: true, imgData: dataURL, key: qrcode_key };
  } catch (error: any) { return { success: false, error: error.message }; }
});

ipcMain.handle('check-login', async (event, qrcode_key) => {
  try {
    const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36' };
    const res = await axios.get(`https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=${qrcode_key}`, { headers });
    if (res.data.data.code === 0) {
      const cookies = res.headers['set-cookie'];
      if (cookies) {
        // 【关键修复一】拼接并保留完整的 Cookie，满足 B 站 WAF 防火墙校验！
        sessionCookie = cookies.map((c: string) => c.split(';')[0]).join('; ');
        fs.writeFileSync(cookiePath, sessionCookie);
        return { status: 'success' };
      }
    } 
    return { status: res.data.data.code === 86090 ? 'scanned' : 'waiting' };
  } catch (error) { return { status: 'error' }; }
});

ipcMain.on('start-download', (event, rawUrl, isBatch, dlSub, downloadDir, isSilent) => {
  if (!rawUrl) return;

  let finalUrl = rawUrl;
  try {
      const urlObj = new URL(rawUrl);
      if (urlObj.searchParams.has('p')) urlObj.searchParams.delete('p');
      if (urlObj.searchParams.has('vd_source')) urlObj.searchParams.delete('vd_source');
      finalUrl = urlObj.toString();
  } catch (e) {}
  //解决打包问题
  const binDir = app.isPackaged 
      ? path.join(process.resourcesPath, 'bin') 
      : path.join(__dirname, '../bin');
      
  const downloaderPath = path.join(binDir, 'BBDown.exe');
  const workDir = downloadDir ? downloadDir : './downloads';
  const args = [ finalUrl, '--work-dir', workDir ];

  if (!dlSub) {
      args.push('--skip-subtitle');
  } else {
      args.push('--skip-ai', 'false');
      event.sender.send('download-progress', `>>> 📝 开启全量字幕下载...\n`);
  }

  if (isBatch) {
      args.push('--file-pattern', '<pageTitle> [<bvid>]');
      args.push('--multi-file-pattern', '<pageTitle> [<bvid>]');
  } else {
      args.push('--file-pattern', '<videoTitle> [<bvid>]');
      args.push('--multi-file-pattern', '<videoTitle> - P<pageNumberWithZero> <pageTitle> [<bvid>]');
  }

  args.push('-p', 'ALL'); 

  if (sessionCookie) args.push('-c', sessionCookie);

  const child = spawn(downloaderPath, args);
  const decoder = new TextDecoder('gbk'); 
  
  child.stdout.on('data', (data) => {
    let text = decoder.decode(data).replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
    event.sender.send('download-progress', text);
  });
  
  child.stderr.on('data', (data) => {
    let text = decoder.decode(data).replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
    event.sender.send('download-progress', text);
  });
  
  child.on('close', (code) => {
      if (isSilent && code === 0) {
          clipboard.writeText(`Enhancer_Download_Finished||${rawUrl}`);
      }
      event.sender.send('download-complete', code);
  });
  
  child.on('error', (err) => {
      console.error('启动失败:', err);
      event.sender.send('download-progress', `>>> ❌ 启动失败: ${err.message}\n请检查 bin 目录下是否有 BBDown.exe`);
  });
});