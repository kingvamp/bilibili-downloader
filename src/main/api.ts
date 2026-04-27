import { ipcMain, dialog, shell } from 'electron';
import axios from 'axios';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
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
      
      // Cookie 已过期或被踢下线，自动清理
      state.sessionCookie = '';
      if (fs.existsSync(AppPaths.cookiePath)) {
        fs.unlinkSync(AppPaths.cookiePath);
      }
      return { isLogin: false };
    } catch (e: any) { 
      return { isLogin: false, error: e.message }; 
    }
  });

  // 手动退出登录
  ipcMain.handle('logout', async () => {
    state.sessionCookie = '';
    try {
      if (fs.existsSync(AppPaths.cookiePath)) {
        fs.unlinkSync(AppPaths.cookiePath);
      }
    } catch (e) {}
    return { success: true };
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

  ipcMain.handle('collect-to-fav-folder', async (event, aid: number, folderId: number) => {
    if (!state.sessionCookie) return { success: false, message: '请先登录' };
    try {
      const csrf = state.sessionCookie.match(/bili_jct=([^;]+)/)?.[1];
      if (!csrf) return { success: false, message: '未找到 CSRF (bili_jct)，请重新登录' };

      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36',
        'Cookie': state.sessionCookie,
        'Content-Type': 'application/x-www-form-urlencoded'
      };

      const res = await axios.post(
        'https://api.bilibili.com/x/v3/fav/resource/deal',
        `rid=${aid}&type=2&add_media_ids=${folderId}&del_media_ids=&platform=web&jsonp=jsonp&csrf=${csrf}`,
        { headers }
      );

      if (res.data.code === 0) {
        return { success: true };
      } else {
        return { success: false, message: res.data.message || '收藏失败' };
      }
    } catch (e: any) {
      return { success: false, message: e.message };
    }
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

  // 【新增】递归扫描本地目录并同步 BV 号到历史记录
  ipcMain.handle('scan-folder-for-history', async () => {
    if (!state.mainWindow) return { success: false, message: '窗口未就绪' };
    
    const { canceled, filePaths } = await dialog.showOpenDialog(state.mainWindow, {
      title: '选择包含已下载视频的目录 (将递归扫描)',
      properties: ['openDirectory']
    });

    if (canceled || filePaths.length === 0) return { success: false, message: '已取消' };

    const targetDir = filePaths[0];
    const foundBvids = new Set<string>();

    const scanDir = (dir: string) => {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stats = fs.statSync(fullPath);
        if (stats.isDirectory()) {
          scanDir(fullPath);
        } else if (stats.isFile()) {
          // 匹配视频和音频常用后缀
          if (/\.(mp4|flv|mkv|mp3|m4a|xml|ass)$/i.test(file)) {
            const matchBv = file.match(/BV[a-zA-Z0-9]{10}/);
            if (matchBv) {
              foundBvids.add(matchBv[0]);
            } else {
              const matchAv = file.match(/av(\d+)/i);
              if (matchAv) {
                 try {
                   const { avToBv } = require('../renderer/utils/bilibili');
                   const bvid = avToBv(matchAv[1]);
                   foundBvids.add(bvid);
                 } catch (e) { console.error('avToBv convert error:', e); }
              }
            }
          }
        }
      }
    };

    try {
      scanDir(targetDir);
      
      // 读取现有历史并合并
      let existingHistory = '';
      try { existingHistory = fs.readFileSync(AppPaths.historyPath, 'utf8'); } catch (e) {}
      const historyLines = existingHistory.split('\n').map(s => s.trim()).filter(Boolean);
      const historySet = new Set(historyLines);
      
      const initialSize = historySet.size;
      foundBvids.forEach(bv => historySet.add(bv));
      const addedCount = historySet.size - initialSize;

      if (addedCount > 0) {
        fs.writeFileSync(AppPaths.historyPath, Array.from(historySet).join('\n') + '\n', 'utf8');
      }

      return { 
        success: true, 
        foundCount: foundBvids.size, 
        addedCount, 
        totalInHistory: historySet.size 
      };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  });
}

function loadCookie(): void {
  try {
    if (fs.existsSync(AppPaths.cookiePath)) {
      state.sessionCookie = fs.readFileSync(AppPaths.cookiePath, 'utf-8').trim();
    }
  } catch (e) { console.error(e); }
}
