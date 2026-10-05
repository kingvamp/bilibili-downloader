// 设置服务：唯一持久化应用偏好，供下载器、窗口、剪贴板、定时器和渲染 IPC 共用。
import { ipcMain } from 'electron';
import Store from 'electron-store';
import { DEFAULT_SETTINGS, type Settings, type SaveSettingsResult } from '../shared/settings';

interface StoredSettings extends Settings {
  lastTriggeredTime: number;
}

export const settingsStore = new Store<StoredSettings>({
  name: 'settings',
  defaults: {
    ...DEFAULT_SETTINGS,
    lastTriggeredTime: 0
  }
});

/** 返回应用偏好，排除由定时器维护的触发时间。 */
export function getSettings(): Settings {
  const { lastTriggeredTime: _, ...settings } = settingsStore.store;
  return settings;
}

/** 校验完整偏好后一次落盘，禁止 IPC 修改定时器状态或写入未知字段。 */
export function saveSettings(settings: Settings): void {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)
    || Object.keys(settings).length !== Object.keys(DEFAULT_SETTINGS).length) {
    throw new Error('设置字段不完整或包含未知字段');
  }
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    if (!Object.hasOwn(settings, key) || typeof settings[key] !== typeof DEFAULT_SETTINGS[key]) {
      throw new Error(`设置字段类型错误: ${key}`);
    }
  }
  if (!settings.downloadDir.trim()) throw new Error('下载目录不能为空');
  settingsStore.set(settings);
}

/** 读取单项设置，业务模块不维护镜像开关。 */
export function getSetting<K extends keyof Settings>(key: K): Settings[K] {
  return settingsStore.get(key);
}


/** 注册偏好 IPC，只有落盘成功才返回保存确认及实际设置。 */
export function setupSettings(): void {
  ipcMain.handle('get-settings', () => getSettings());
  ipcMain.handle('save-settings', (_event, next: Settings): SaveSettingsResult => {
    try {
      saveSettings(next);
      return { success: true, settings: getSettings() };
    } catch (error) {
      console.error('[settings] 保存失败:', error);
      return { success: false, message: error instanceof Error ? error.message : String(error) };
    }
  });
}
