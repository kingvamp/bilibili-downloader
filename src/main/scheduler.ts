import { ipcMain, powerMonitor } from 'electron';
import axios from 'axios';
import { state } from './state';

import { getSetting, settingsStore } from './settings';

export function shouldUnfavAfterDownload(): boolean {
  return getSetting('unfavAfterDownload');
}

async function fetchDefaultFavId(): Promise<number | null> {
  if (!state.sessionCookie) return null;

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36',
      'Cookie': state.sessionCookie
    };
    const nav = await axios.get('https://api.bilibili.com/x/web-interface/nav', { headers });
    if (nav.data.code !== 0 || !nav.data.data.isLogin) return null;

    const folders = await axios.get(
      `https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=${nav.data.data.mid}`,
      { headers }
    );
    return folders.data.code === 0 ? folders.data.data.list?.[0]?.id ?? null : null;
  } catch (error) {
    console.error('[scheduler] 获取默认收藏夹 ID 失败:', error);
    return null;
  }
}

let lastWarnedNoLoginTime = 0;

async function checkAndTriggerAutoDownload(): Promise<void> {
  if (!getSetting('autoDownloadFav') || !state.mainWindow) return;

  const now = Date.now();

  if (!state.sessionCookie) {
    if (now - lastWarnedNoLoginTime >= 60 * 60 * 1000) {
      lastWarnedNoLoginTime = now;
      state.mainWindow.webContents.send(
        'scheduled-fav-download',
        null,
        '⚠️ 每日自动下载触发，但检测到当前未登录，已跳过。请登录后等待下一次轮询。'
      );
    }
    return;
  }

  const favId = await fetchDefaultFavId();
  if (!favId) {
    state.mainWindow.webContents.send(
      'scheduled-fav-download',
      null,
      '⚠️ 每日自动下载触发，但未能获取默认收藏夹 ID，已跳过。'
    );
    return;
  }

  state.mainWindow.webContents.send('scheduled-fav-download', String(favId), null);
  settingsStore.set('lastTriggeredTime', now);
}

export function setupScheduler(): void {
  ipcMain.handle('get-last-triggered-time', () => settingsStore.get('lastTriggeredTime'));

  settingsStore.onDidChange('autoDownloadFav', (enabled, previous) => {
    if (enabled && !previous) {
      settingsStore.set('lastTriggeredTime', 0);
      void checkAndTriggerAutoDownload();
    }
  });

  powerMonitor.on('resume', () => void checkAndTriggerAutoDownload());
  setTimeout(() => void checkAndTriggerAutoDownload(), 10_000);
  setInterval(() => void checkAndTriggerAutoDownload(), 60 * 60 * 1000);
}
