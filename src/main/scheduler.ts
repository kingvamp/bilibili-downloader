// scheduler.ts
// 定时任务模块：重构为每日自动下载，间隔 >= 24小时触发一次自动下载默认收藏夹
// 关联：state.ts（读写 autoDownloadFav）、api.ts（get-default-fav-id 逻辑）、渲染进程（接收 scheduled-fav-download 事件）

import { ipcMain } from 'electron';
import fs from 'fs';
import axios from 'axios';
import { state } from './state';
import path from 'path';
import { app } from 'electron';

interface SchedulerConfig {
  autoDownloadFav: boolean;
  lastTriggeredTime: number; // 毫秒时间戳
}

/** 获取定时配置文件路径 */
function getSchedulerConfigPath(): string {
  return path.join(app.getPath('userData'), 'scheduler.json');
}

/** 从磁盘加载每日下载配置 */
function loadConfig(): SchedulerConfig {
  try {
    const configPath = getSchedulerConfigPath();
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8').trim();
      const parsed = JSON.parse(raw);
      return {
        autoDownloadFav: typeof parsed.autoDownloadFav === 'boolean' ? parsed.autoDownloadFav : false,
        lastTriggeredTime: typeof parsed.lastTriggeredTime === 'number' ? parsed.lastTriggeredTime : 0,
      };
    }
  } catch (e) {
    console.error('[scheduler] 加载定时配置失败:', e);
  }
  return { autoDownloadFav: false, lastTriggeredTime: 0 };
}

/** 将配置写入磁盘 */
function saveConfig(config: SchedulerConfig): void {
  try {
    const configPath = getSchedulerConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (e) {
    console.error('[scheduler] 保存定时配置失败:', e);
  }
}

/** 从 B 站 API 获取当前账号默认收藏夹 ID，登录失效时返回 null */
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

// 内存中记录最后一次提示未登录的时间，防止日志刷屏
let lastWarnedNoLoginTime = 0;

/** 检查时间间隔并在满足 24 小时时触发下载 */
async function checkAndTriggerAutoDownload(): Promise<void> {
  if (!state.autoDownloadFav) return;

  const config = loadConfig();
  // 检查是否距离上次触发已满 24 小时
  const INTERVAL_MS = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const timeDiff = now - config.lastTriggeredTime;

  if (timeDiff < INTERVAL_MS) {
    return; // 未满 24 小时，跳过
  }

  if (!state.mainWindow) {
    console.warn('[scheduler] 窗口未就绪，跳过本次自动下载');
    return;
  }

  // 如果未登录，不触发也不更新 lastTriggeredTime（等待登录后再触发）
  // 但为了给用户提示，每过 1 小时最多提示一次
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

  // 成功触发后，更新上次触发时间戳并保存
  config.lastTriggeredTime = now;
  saveConfig(config);
}

/** 注册定时调度器 */
export function setupScheduler(): void {
  // 启动时从磁盘恢复开关状态
  const config = loadConfig();
  state.autoDownloadFav = config.autoDownloadFav;
  console.log(`[scheduler] 已加载定时配置: 每日自动下载开关="${state.autoDownloadFav}"，上次触发时间="${config.lastTriggeredTime ? new Date(config.lastTriggeredTime).toLocaleString() : '无记录'}"`);

  // IPC：渲染进程查询上次触发的时间戳
  ipcMain.handle('get-last-triggered-time', () => {
    const cfg = loadConfig();
    return cfg.lastTriggeredTime;
  });

  // IPC：渲染进程查询自动下载开关状态
  ipcMain.handle('get-auto-download-fav', () => {
    return state.autoDownloadFav;
  });

  // IPC：渲染进程更新自动下载开关状态
  ipcMain.on('set-auto-download-fav', (_event, enabled: boolean) => {
    state.autoDownloadFav = enabled;
    const cfg = loadConfig();
    cfg.autoDownloadFav = enabled;
    // 如果关闭后又重新开启，为了响应可能积压的任务，我们将 lastTriggeredTime 重置为 0，以便立即触发一次
    if (enabled) {
      cfg.lastTriggeredTime = 0;
    }
    saveConfig(cfg);
    console.log(`[scheduler] 每日自动下载开关已更新为: "${enabled}"`);
    
    if (enabled) {
      // 重新开启时立即做一次检查
      checkAndTriggerAutoDownload();
    }
  });

  // 启动后延迟 10 秒进行首次检查（确保渲染进程完成初始化与 Cookie 加载）
  setTimeout(() => {
    console.log('[scheduler] 执行启动后首次自动下载检查...');
    checkAndTriggerAutoDownload();
  }, 10 * 1000);

  // 每 10 分钟轮询一次
  setInterval(() => {
    checkAndTriggerAutoDownload();
  }, 10 * 60 * 1000);
}
