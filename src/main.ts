import { app } from 'electron';
import { setupWindow } from './main/window';
import { setupApi } from './main/api';
import { setupClipboard, stopClipboard } from './main/clipboard';
import { setupDownloader } from './main/downloader';
import { setupUpdater } from './main/updater';

app.whenReady().then(() => {
  // 强制注册 App ID，打破 Windows 的通知拦截拦截
  app.setAppUserModelId('com.enhancer.bilibilidownloader');

  setupApi();
  setupWindow();
  setupClipboard();
  setupDownloader();
  setupUpdater();
});

app.on('will-quit', () => {
  stopClipboard();
});