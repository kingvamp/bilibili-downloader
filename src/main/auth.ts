import Store from 'electron-store';

const store = new Store<{ sessionCookie: string }>({
  name: 'auth',
  defaults: { sessionCookie: '' }
});

export const getCookie = (): string => store.get('sessionCookie');
export const setCookie = (cookie: string): void => store.set('sessionCookie', cookie);
export const clearCookie = (): void => store.delete('sessionCookie');
