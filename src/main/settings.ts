import { ipcMain } from 'electron';
import Store from 'electron-store';
import { DEFAULT_SETTINGS, type Settings } from '../shared/settings';

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

export function getSettings(): Settings {
  const { lastTriggeredTime: _, ...settings } = settingsStore.store;
  return settings;
}

export function saveSettings(settings: Settings): void {
  settingsStore.set(settings);
}

export function getSetting<K extends keyof Settings>(key: K): Settings[K] {
  return settingsStore.get(key);
}


export function setupSettings(): void {
  ipcMain.handle('get-settings', () => getSettings());
  ipcMain.handle('save-settings', (_event, next: Settings) => {
    saveSettings(next);
    return { success: true };
  });
}
