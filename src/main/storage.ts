import Store from 'electron-store';
import fs from 'fs';
import { AppPaths } from './state';

interface AuthStoreSchema {
  sessionCookie: string;
}

let authStore: Store<AuthStoreSchema> | null = null;

function getAuthStore(): Store<AuthStoreSchema> {
  if (!authStore) {
    authStore = new Store<AuthStoreSchema>({
      name: 'auth',
      defaults: {
        sessionCookie: ''
      }
    });
  }
  return authStore;
}

export function loadSessionCookie(): string {
  const store = getAuthStore();
  const persisted = store.get('sessionCookie', '').trim();
  if (persisted) return persisted;

  // 一次性兼容旧版本 cookie.txt；迁移成功后删除旧文件。
  try {
    if (fs.existsSync(AppPaths.cookiePath)) {
      const legacyCookie = fs.readFileSync(AppPaths.cookiePath, 'utf8').trim();
      if (legacyCookie) {
        store.set('sessionCookie', legacyCookie);
      }
      fs.unlinkSync(AppPaths.cookiePath);
      return legacyCookie;
    }
  } catch (error) {
    console.warn('[AuthStore] 迁移旧 Cookie 文件失败:', error);
  }

  return '';
}

export function saveSessionCookie(cookie: string): void {
  getAuthStore().set('sessionCookie', cookie);
}

export function clearSessionCookie(): void {
  getAuthStore().delete('sessionCookie');

  // 兼容升级过程中残留的旧文件。
  try {
    if (fs.existsSync(AppPaths.cookiePath)) {
      fs.unlinkSync(AppPaths.cookiePath);
    }
  } catch (error) {
    console.warn('[AuthStore] 删除旧 Cookie 文件失败:', error);
  }
}
