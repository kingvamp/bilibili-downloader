// scheduler.ts
// 定时任务模块：负责在指定时间点自动触发默认收藏夹下载
// 关联：state.ts（读写 scheduledTime）、api.ts（get-default-fav-id 逻辑）、渲染进程（接收 scheduled-fav-download 事件）

import { ipcMain } from 'electron';
import fs from 'fs';
import axios from 'axios';
import { state, AppPaths } from './state';

// 持久化文件路径（与 cookie、history 同目录）
import path from 'path';
import { app } from 'electron';

/** 获取定时配置文件路径 */
function getSchedulerConfigPath(): string {
  return path.join(app.getPath('userData'), 'scheduler.json');
}

/** 从磁盘加载定时时间配置 */
function loadScheduledTime(): string {
  try {
    const configPath = getSchedulerConfigPath();
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8').trim();
      const parsed = JSON.parse(raw);
      return typeof parsed.scheduledTime === 'string' ? parsed.scheduledTime : '';
    }
  } catch (e) {
    console.error('[scheduler] 加载定时配置失败:', e);
  }
  return '';
}

/** 将定时时间持久化到磁盘 */
function saveScheduledTime(time: string): void {
  try {
    const configPath = getSchedulerConfigPath();
    fs.writeFileSync(configPath, JSON.stringify({ scheduledTime: time }), 'utf-8');
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

/** 注册定时调度器 */
export function setupScheduler(): void {
  // 启动时从磁盘恢复上次设定的时间
  state.scheduledTime = loadScheduledTime();
  console.log(`[scheduler] 已加载定时配置: "${state.scheduledTime || '未设置'}"`);

  // IPC：渲染进程查询当前设定时间
  ipcMain.handle('get-scheduled-time', () => {
    return state.scheduledTime;
  });

  // IPC：渲染进程更新定时时间（空字符串表示禁用）
  ipcMain.on('set-scheduled-time', (_event, time: string) => {
    state.scheduledTime = time;
    saveScheduledTime(time);
    console.log(`[scheduler] 定时时间已更新为: "${time || '已禁用'}"`);
  });

  // 每 10 分钟轮询一次，检查是否命中当前整点小时
  // lastTriggeredHour 记录本次运行期间上次触发的小时（-1 表示从未触发），防止同一小时内重复触发
  let lastTriggeredHour = -1;

  setInterval(async () => {
    const target = state.scheduledTime; // 存储格式为小时字符串，如 "2" 表示每天 2:00
    if (!target) return; // 未设置，跳过

    const now = new Date();
    const currentHour = now.getHours();
    const targetHour = parseInt(target, 10);

    // 整点匹配：当前小时等于设定小时，且本小时尚未触发过
    if (currentHour !== targetHour || lastTriggeredHour === currentHour) return;

    // 标记为已触发，防止本小时内 10 分钟后再次轮询时重复执行
    lastTriggeredHour = currentHour;

    console.log(`[scheduler] ⏰ 定时触发 (${currentHour}:00)，正在获取默认收藏夹...`);

    if (!state.mainWindow) {
      console.warn('[scheduler] 窗口未就绪，跳过本次定时任务');
      return;
    }

    // 未登录时跳过，并给用户一个日志提示
    if (!state.sessionCookie) {
      console.warn('[scheduler] 未登录，跳过本次定时任务');
      state.mainWindow.webContents.send(
        'scheduled-fav-download',
        null,
        '⚠️ 定时任务触发，但当前未登录，已跳过。'
      );
      return;
    }

    const favId = await fetchDefaultFavId();
    if (!favId) {
      console.warn('[scheduler] 未能获取默认收藏夹 ID，跳过');
      state.mainWindow.webContents.send(
        'scheduled-fav-download',
        null,
        '⚠️ 定时任务触发，但未能获取默认收藏夹 ID，已跳过。'
      );
      return;
    }

    console.log(`[scheduler] 获取到收藏夹 ID: ${favId}，通知渲染进程执行下载`);
    // 将收藏夹 ID（字符串格式，与现有 URL 解析逻辑兼容）传给渲染进程
    state.mainWindow.webContents.send('scheduled-fav-download', String(favId), null);
  }, 10 * 60 * 1000); // 每 10 分钟轮询一次
}
