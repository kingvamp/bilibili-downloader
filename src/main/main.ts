import { app } from 'electron';
import { setupWindow } from './window';
import { setupApi } from './api';
import { setupClipboard, stopClipboard } from './clipboard';
import { setupDownloader } from './downloader';
import { setupUpdater } from './updater';
import { setupServer } from './server';
import { setupScheduler } from './scheduler';

app.whenReady().then(() => {
  // 强制注册 App ID，打破 Windows 的通知拦截拦截
  app.setAppUserModelId('com.enhancer.bilibilidownloader');

  setupApi();
  setupWindow();
  setupClipboard();
  setupDownloader();
  setupUpdater();
  setupServer();
  setupScheduler();
});

app.on('will-quit', () => {
  stopClipboard();
});