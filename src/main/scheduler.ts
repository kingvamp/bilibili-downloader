// scheduler.ts
// 定时任务模块：electron-store 负责 scheduler.json 的原子持久化；轮询与唤醒逻辑保持原行为。

import { ipcMain, powerMonitor } from 'electron';
import axios from 'axios';
import Store from 'electron-store';
import { state } from './state';

interface SchedulerConfig {
  autoDownloadFav: boolean;
  lastTriggeredTime: number;
  unfavAfterDownload?: boolean;
}

const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  autoDownloadFav: false,
  lastTriggeredTime: 0,
  unfavAfterDownload: false
};

let schedulerStore: Store<SchedulerConfig> | null = null;

function getSchedulerStore(): Store<SchedulerConfig> {
  if (!schedulerStore) {
    schedulerStore = new Store<SchedulerConfig>({
      name: 'scheduler',
      defaults: DEFAULT_SCHEDULER_CONFIG
    });
  }
  return schedulerStore;
}

function loadConfig(): SchedulerConfig {
  try {
    return {
      ...DEFAULT_SCHEDULER_CONFIG,
      ...getSchedulerStore().store
    };
  } catch (e) {
    console.error('[scheduler] 加载定时配置失败:', e);
    return { ...DEFAULT_SCHEDULER_CONFIG };
  }
}

function saveConfig(config: SchedulerConfig): void {
  try {
    getSchedulerStore().store = config;
  } catch (e) {
    console.error('[scheduler] 保存定时配置失败:', e);
  }
}

async function fetchDefaultFavId(): Promise<number | null> {
  if (!state.sessionCookie) return null;
  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36',
      'Cookie': state.sessionCookie
    };
    const navRes = await axios.get('https://api.bilibili.com/x/web-interface/nav', { headers });
    if (navRes.data.code !== 0 || !navRes.data.data.isLogin) return null;

    const mid = navRes.data.data.mid;
    const favRes = await axios.get(
      `https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=${mid}`,
      { headers }
    );
    if (favRes.data.code === 0 && favRes.data.data.list?.length > 0) {
      return favRes.data.data.list[0].id;
    }
  } catch (e) {
    console.error('[scheduler] 获取默认收藏夹 ID 失败:', e);
  }
  return null;
}

let lastWarnedNoLoginTime = 0;

async function checkAndTriggerAutoDownload(): Promise<void> {
  if (!state.autoDownloadFav) return;

  const config = loadConfig();
  const now = Date.now();

  if (!state.mainWindow) {
    console.warn('[scheduler] 窗口未就绪，跳过本次自动下载');
    return;
  }

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

  console.log('[scheduler] ⏰ 满足每日自动下载条件（距离上次超过24小时），开始获取默认收藏夹...');
  const favId = await fetchDefaultFavId();

  if (!favId) {
    console.warn('[scheduler] 未能获取默认收藏夹 ID，跳过');
    state.mainWindow.webContents.send(
      'scheduled-fav-download',
      null,
      '⚠️ 每日自动下载触发，但未能获取默认收藏夹 ID，已跳过。'
    );
    return;
  }

  console.log(`[scheduler] 获取到收藏夹 ID: ${favId}，通知渲染进程执行下载`);
  state.mainWindow.webContents.send('scheduled-fav-download', String(favId), null);

  config.lastTriggeredTime = now;
  saveConfig(config);
}

export function setupScheduler(): void {
  const config = loadConfig();
  state.autoDownloadFav = config.autoDownloadFav;
  state.unfavAfterDownload = config.unfavAfterDownload || false;
  console.log(
    `[scheduler] 已加载定时配置: 每日自动下载开关="${state.autoDownloadFav}"，下载后自动取消收藏开关="${state.unfavAfterDownload}"，上次触发时间="${config.lastTriggeredTime ? new Date(config.lastTriggeredTime).toLocaleString() : '无记录'}"`
  );

  ipcMain.handle('get-last-triggered-time', () => loadConfig().lastTriggeredTime);

  ipcMain.handle('get-auto-download-fav', () => state.autoDownloadFav);

  ipcMain.on('set-auto-download-fav', (_event, enabled: boolean) => {
    state.autoDownloadFav = enabled;
    const cfg = loadConfig();
    cfg.autoDownloadFav = enabled;
    if (enabled) cfg.lastTriggeredTime = 0;
    saveConfig(cfg);
    console.log(`[scheduler] 每日自动下载开关已更新为: "${enabled}"`);

    if (enabled) {
      void checkAndTriggerAutoDownload();
    }
  });

  ipcMain.on('set-unfav-after-download', (_event, enabled: boolean) => {
    state.unfavAfterDownload = enabled;
    const cfg = loadConfig();
    cfg.unfavAfterDownload = enabled;
    saveConfig(cfg);
    console.log(`[scheduler] 下载后自动取消收藏开关已更新为: "${enabled}"`);
  });

  powerMonitor.on('resume', () => {
    console.log('[scheduler] 系统从睡眠中唤醒，立即触发自动下载检查...');
    void checkAndTriggerAutoDownload();
  });

  setTimeout(() => {
    console.log('[scheduler] 执行启动后首次自动下载检查...');
    void checkAndTriggerAutoDownload();
  }, 10 * 1000);

  setInterval(() => {
    void checkAndTriggerAutoDownload();
  }, 60 * 60 * 1000);
}
