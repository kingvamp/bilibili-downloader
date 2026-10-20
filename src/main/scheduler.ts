// 定时任务模块：启动、每小时轮询和系统唤醒时通知统一下载流程。
// 关联：settings.ts 保存开关和触发时间，渲染进程取得执行权后查询默认收藏夹。
import { ipcMain, powerMonitor } from 'electron';
import { getDownloadManager } from './downloadRuntime';
import { getSetting, settingsStore } from './settings';
import { getCookie } from './auth';

// 内存中记录最后一次提示未登录的时间，防止日志刷屏。
let lastWarnedNoLoginTime = 0;

/** 检查开关并发送意图，收藏夹网络查询由统一流程持有执行权后发起。 */
function checkAndTriggerAutoDownload(): void {
  if (!getSetting('autoDownloadFav')) return;
  const now = Date.now();
  // 未登录时不触发也不更新触发时间，每小时最多提示一次。
  if (!getCookie()) {
    if (now - lastWarnedNoLoginTime >= 60 * 60 * 1000) {
      lastWarnedNoLoginTime = now;
      console.warn('[scheduler] 未登录，跳过本次收藏夹扫描');
    }
    return;
  }
  if (!getDownloadManager().startDefaultFavorites()) return;
  // 只有真正取得下载执行权才记录本次触发时间。
  try {
    settingsStore.set('lastTriggeredTime', now);
  } catch (error) {
    console.error('[scheduler] 保存触发时间失败:', error);
  }
}

/** 注册查询、开关、唤醒、启动和轮询触发，共用同一个设置源。 */
export function setupScheduler(): void {
  ipcMain.handle('get-last-triggered-time', () => settingsStore.get('lastTriggeredTime'));
  settingsStore.onDidChange('autoDownloadFav', (enabled, previous) => {
    // 重新开启立即检查，不独立建立下载流程。
    if (enabled && !previous) checkAndTriggerAutoDownload();
  });
  powerMonitor.on('resume', checkAndTriggerAutoDownload);
  // 启动延迟用于等待渲染进程注册监听。
  setTimeout(checkAndTriggerAutoDownload, 10_000);
  setInterval(checkAndTriggerAutoDownload, 60 * 60 * 1000);
}
