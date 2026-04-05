import { ipcMain } from 'electron';
import axios from 'axios';
import QRCode from 'qrcode';
import fs from 'fs';
import { state, AppPaths } from './state';

export function setupApi() {
  loadCookie();

  ipcMain.handle('get-user-info', async () => {
    if (!state.sessionCookie) return { isLogin: false };
    try {
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36',
        'Cookie': state.sessionCookie
      };
      const res = await axios.get('https://api.bilibili.com/x/web-interface/nav', { headers });
      if (res.data.code === 0 && res.data.data.isLogin) {
        return { 
          isLogin: true, 
          uname: res.data.data.uname, 
          face: res.data.data.face,
          mid: res.data.data.mid
        };
      }
      return { isLogin: false };
    } catch (e: any) { return { isLogin: false, error: e.message }; }
  });

  ipcMain.handle('get-default-fav-id', async () => {
    if (!state.sessionCookie) return null;
    try {
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36',
        'Cookie': state.sessionCookie
      };
      const navRes = await axios.get('https://api.bilibili.com/x/web-interface/nav', { headers });
      if (navRes.data.code !== 0 || !navRes.data.data.isLogin) return null;
      const mid = navRes.data.data.mid;
      
      const favRes = await axios.get(`https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=${mid}`, { headers });
      if (favRes.data.code === 0 && favRes.data.data.list && favRes.data.data.list.length > 0) {
        return favRes.data.data.list[0].id;
      }
      return null;
    } catch (e) { return null; }
  });

  ipcMain.handle('get-qrcode', async () => {
    try {
      const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36' };
      const res = await axios.get('https://passport.bilibili.com/x/passport-login/web/qrcode/generate', { headers });
      const { url, qrcode_key } = res.data.data;
      const dataURL = await QRCode.toDataURL(url);
      return { success: true, imgData: dataURL, key: qrcode_key };
    } catch (error: any) { return { success: false, error: error.message }; }
  });

  ipcMain.handle('check-login', async (event, qrcode_key) => {
    try {
      const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36' };
      const res = await axios.get(`https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=${qrcode_key}`, { headers });
      if (res.data.data.code === 0) {
        const cookies = res.headers['set-cookie'];
        if (cookies) {
          state.sessionCookie = cookies.map((c: string) => c.split(';')[0]).join('; ');
          fs.writeFileSync(AppPaths.cookiePath, state.sessionCookie);
          return { status: 'success' };
        }
      } 
      return { status: res.data.data.code === 86090 ? 'scanned' : 'waiting' };
    } catch (error) { return { status: 'error' }; }
  });
}

function loadCookie(): void {
  try {
    if (fs.existsSync(AppPaths.cookiePath)) {
      state.sessionCookie = fs.readFileSync(AppPaths.cookiePath, 'utf-8').trim();
    }
  } catch (e) { console.error(e); }
}
