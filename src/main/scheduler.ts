// 定时任务模块：启动、每小时轮询和系统唤醒时通知统一下载流程。
// 关联：settings.ts 保存开关和触发时间，downloadRuntime.ts 在主进程直接启动唯一流程。
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
      getDownloadManager().report('>>> ⚠️ 每小时自动扫描跳过：尚未登录 Bilibili。\n');
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
  // 启动后延迟检查，避免与设置及登录状态初始化竞争。
  setTimeout(checkAndTriggerAutoDownload, 10_000);
  setInterval(checkAndTriggerAutoDownload, 60 * 60 * 1000);
}
