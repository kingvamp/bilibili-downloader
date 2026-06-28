import { useState, useEffect } from 'react';
import { Settings } from '../types';

export function useSettings(appendLog: (msg: string) => void) {
  const [settings, setSettings] = useState<Settings>({
    downloadDir: localStorage.getItem('downloadDir') || './downloads',
    clipboardMonitor: localStorage.getItem('clipboardMonitor') === 'true',
    dlSub: localStorage.getItem('dlSub') === 'true',
    multiThread: localStorage.getItem('multiThread') === 'true',
    closeToTray: localStorage.getItem('closeToTray') !== 'false',
    notifyState: localStorage.getItem('notifyState') !== 'false',
    soundState: localStorage.getItem('soundState') === 'true',
    autoDownloadFav: localStorage.getItem('autoDownloadFav') === 'true',
  });

  const saveSettings = (newSettings: Settings) => {
    // Explicitly update main process states if they changed
    if (settings.clipboardMonitor !== newSettings.clipboardMonitor) {
      window.api.setClipboardMonitor(newSettings.clipboardMonitor);
      appendLog(newSettings.clipboardMonitor ? `\n>>> 📋 剪贴板监听已开启。\n` : `\n>>> ⏸️ 剪贴板监听已关闭。\n`);
    }
    if (settings.closeToTray !== newSettings.closeToTray) window.api.setCloseToTray(newSettings.closeToTray);
    if (settings.notifyState !== newSettings.notifyState) window.api.setNotifyState(newSettings.notifyState);
    if (settings.soundState !== newSettings.soundState) window.api.setSoundState(newSettings.soundState);
    // 每日自动下载状态变更时同步到主进程
    if (settings.autoDownloadFav !== newSettings.autoDownloadFav) window.api.setAutoDownloadFav(newSettings.autoDownloadFav);

    // Save to localStorage
    Object.entries(newSettings).forEach(([key, value]) => {
      localStorage.setItem(key, String(value));
    });
    setSettings(newSettings);
  };

  useEffect(() => {
    window.api.setCloseToTray(settings.closeToTray);
    window.api.setNotifyState(settings.notifyState);
    window.api.setSoundState(settings.soundState);
    if (settings.clipboardMonitor) {
      window.api.setClipboardMonitor(true);
      appendLog('>>> 📋 剪贴板监听已按偏好设置自动开启\n');
    }
  }, []);

  return {
    settings,
    saveSettings,
  };
}
