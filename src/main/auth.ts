// 认证存储：API 和下载器共享 Cookie，运行状态不再维护认证副本。
import Store from 'electron-store';

const store = new Store<{ sessionCookie: string }>({
  name: 'auth',
  defaults: { sessionCookie: '' }
});

/** 读取已持久化 Cookie。 */
export const getCookie = (): string => store.get('sessionCookie');
/** 扫码成功后保存 Cookie。 */
export const setCookie = (cookie: string): void => store.set('sessionCookie', cookie);
/** 退出或凭据失效时清空 Cookie，保持空字符串契约。 */
export const clearCookie = (): void => store.set('sessionCookie', '');
