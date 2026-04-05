import { autoUpdater } from 'electron-updater';
import { state } from './state';

export function setupUpdater() {
  autoUpdater.autoDownload = true; 
  autoUpdater.autoInstallOnAppQuit = true; 

  autoUpdater.on('checking-for-update', () => {
      state.mainWindow?.webContents.send('download-progress', '>>> 🔄 正在连接 GitHub 检测软件更新...\n');
  });
  
  autoUpdater.on('update-available', (info) => {
      state.mainWindow?.webContents.send('download-progress', `>>> ✨ 发现新版本 v${info.version}！正在后台静默下载，请稍候...\n`);
  });
  
  autoUpdater.on('update-not-available', () => {
      state.mainWindow?.webContents.send('download-progress', '>>> ✅ 当前软件已是最新版本。\n');
  });
  
  autoUpdater.on('update-downloaded', () => {
      state.mainWindow?.webContents.send('download-progress', '>>> 🎉 新版本后台下载完成！将在下次彻底退出并重启软件时自动完成升级。\n');
  });

  autoUpdater.on('error', (err) => {
      state.mainWindow?.webContents.send('download-progress', `>>> ⚠️ 检查更新失败: ${err.message}\n`);
  });

  setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify();
  }, 3000);
}
