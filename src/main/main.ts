import { app } from 'electron';
import { setupWindow } from './window';
import { setupApi } from './api';
import { setupClipboard, stopClipboard } from './clipboard';
import { setupServer } from './server';
import { setupScheduler } from './scheduler';
import { setupSettings } from './settings';
import { setupDownloadRuntime } from './downloadRuntime';

app.whenReady().then(() => {
  // 强制注册 App ID，打破 Windows 的通知拦截拦截
  app.setAppUserModelId('com.enhancer.bilibilidownloader');

  setupSettings();
  setupApi();
  setupWindow();
  setupClipboard();
  setupServer();
  setupDownloadRuntime();
  setupScheduler();
});

app.on('will-quit', () => {
  stopClipboard();
});