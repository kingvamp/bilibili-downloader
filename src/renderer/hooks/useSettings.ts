import { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, type Settings } from '../../shared/settings';

export function useSettings(appendLog: (msg: string) => void) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    void window.api.getSettings().then(setSettings);
  }, []);

  const saveSettings = (next: Settings) => {
    if (settings.clipboardMonitor !== next.clipboardMonitor) {
      appendLog(next.clipboardMonitor
        ? '\n>>> 📋 剪贴板监听已开启。\n'
        : '\n>>> ⏸️ 剪贴板监听已关闭。\n');
    }
    setSettings(next);
    void window.api.saveSettings(next);
  };

  return { settings, saveSettings };
}
