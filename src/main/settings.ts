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
