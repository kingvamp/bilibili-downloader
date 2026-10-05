// 主进程 API 模块：提供获取用户信息、登录/退出、获取默认收藏夹ID、收藏/取消收藏、生成二维码、扫描本地历史等接口，与渲染进程进行 IPC 通信。
import { ipcMain, dialog, shell } from 'electron';
import axios from 'axios';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import fg from 'fast-glob';
import { state, AppPaths } from './state';
import { clearCookie, getCookie, setCookie } from './auth';


// 下载完成与 IPC 清理共用一个取消收藏队列，任何时刻只发送一个请求。
let removalQueue: Promise<void> = Promise.resolve();

/** 串行安排取消收藏请求，某次失败不会阻塞后续请求。 */
export function removeFromFavFolder(aid: number, folderId: number): Promise<{ success: boolean; message?: string }> {
  const request = removalQueue.then(() => requestRemoval(aid, folderId));
  removalQueue = request.then(() => undefined, error => { console.error('取消收藏队列异常:', error); });
  return request;
}

/** 从指定收藏夹取消收藏，并统一校验 B 站业务结果和登录凭据。 */
async function requestRemoval(aid: number, folderId: number): Promise<{ success: boolean; message?: string }> {
  if (!getCookie()) return { success: false, message: '请先登录' };
  try {
    const csrf = getCookie().match(/bili_jct=([^;]+)/)?.[1];
    if (!csrf) return { success: false, message: '未找到 CSRF (bili_jct)，请重新登录' };

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36',
      'Cookie': getCookie(),
      'Content-Type': 'application/x-www-form-urlencoded'
    };

    const res = await axios.post(
      'https://api.bilibili.com/x/v3/fav/resource/deal',
      `rid=${aid}&type=2&add_media_ids=&del_media_ids=${folderId}&platform=web&jsonp=jsonp&csrf=${csrf}`,
      { headers }
    );

    if (res.data.code === 0) {
      return { success: true };
    }
    return {
      success: false,
      message: `${res.data.message || '取消收藏失败'} (code: ${res.data.code})`
    };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

/** 注册主进程 API，并恢复本地登录凭据。 */
export function setupApi() {
  ipcMain.handle('get-user-info', async () => {
    if (!getCookie()) return { isLogin: false };
    try {
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36',
        'Cookie': getCookie()
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
      clearCookie();
      return { isLogin: false };
    } catch (e: any) { 
      return { isLogin: false, error: e.message }; 
    }
  });

  // 手动退出登录
  ipcMain.handle('logout', async () => {
    clearCookie();
    return { success: true };
  });

  ipcMain.handle('get-default-fav-id', async () => {
    if (!getCookie()) return null;
    try {
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36',
        'Cookie': getCookie()
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
    if (!getCookie()) return { success: false, message: '请先登录' };
    try {
      const csrf = getCookie().match(/bili_jct=([^;]+)/)?.[1];
      if (!csrf) return { success: false, message: '未找到 CSRF (bili_jct)，请重新登录' };

      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36',
        'Cookie': getCookie(),
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

  // 从指定收藏夹中取消收藏某视频
  ipcMain.handle('remove-from-fav-folder', (_event, aid: number, folderId: number) =>
    removeFromFavFolder(aid, folderId)
  );

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
          setCookie(cookies.map((c: string) => c.split(';')[0]).join('; '));
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

    try {
      const mediaFiles = await fg(
        ['**/*.{mp4,flv,mkv,mp3,m4a,xml,ass}'],
        {
          cwd: targetDir,
          onlyFiles: true,
          caseSensitiveMatch: false,
          absolute: false,
          dot: true
        }
      );

      for (const relativePath of mediaFiles) {
        const file = path.basename(relativePath);
        const matchBv = file.match(/BV[a-zA-Z0-9]{10}/);
        if (matchBv) {
          foundBvids.add(matchBv[0]);
          continue;
        }

        const matchAv = file.match(/av(\d+)/i);
        if (matchAv) {
          try {
            const { avToBv } = require('../renderer/utils/bilibili');
            foundBvids.add(avToBv(matchAv[1]));
          } catch (e) {
            console.error('avToBv convert error:', e);
          }
        }
      }
      
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

  // 获取下载历史总数
  ipcMain.handle('get-history-count', async () => {
    try {
      if (fs.existsSync(AppPaths.historyPath)) {
        const content = fs.readFileSync(AppPaths.historyPath, 'utf8');
        return content.split('\n').map(s => s.trim()).filter(Boolean).length;
      }
      return 0;
    } catch (e) {
      return 0;
    }
  });

}
