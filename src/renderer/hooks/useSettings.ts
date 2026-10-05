// 设置 Hook：读取主进程偏好，并在保存确认后更新界面，错误保持可见。
import { useEffect, useRef, useState } from 'react';
import { DEFAULT_SETTINGS, type Settings } from '../../shared/settings';

/** 管理设置加载与保存状态，禁止未加载和重复保存。 */
export function useSettings(appendLog: (msg: string) => void) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isReady, setIsReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    let active = true;
    void window.api.getSettings().then(saved => {
      if (!active) return;
      setSettings(saved);
      setIsReady(true);
    }).catch(error => {
      if (!active) return;
      console.error('[settings] 加载失败:', error);
      alert(`加载设置失败: ${error instanceof Error ? error.message : String(error)}`);
    });
    return () => { active = false; };
  }, []);

  /** 等待主进程保存确认，失败时保留原值和设置窗口。 */
  const saveSettings = async (next: Settings): Promise<boolean> => {
    if (!isReady || savingRef.current) return false;
    savingRef.current = true;
    setIsSaving(true);
    try {
      const result = await window.api.saveSettings(next);
      if (!result.success) throw new Error(result.message);
      if (settings.clipboardMonitor !== result.settings.clipboardMonitor) {
        appendLog(result.settings.clipboardMonitor
          ? '\n>>> 📋 剪贴板监听已开启。\n'
          : '\n>>> ⏸️ 剪贴板监听已关闭。\n');
      }
      setSettings(result.settings);
      return true;
    } catch (error) {
      console.error('[settings] 保存失败:', error);
      alert(`保存设置失败: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  return { settings, saveSettings, isReady, isSaving };
}
