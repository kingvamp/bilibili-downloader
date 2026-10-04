// 主进程下载模块：管理 BBDown 下载与历史同步。
// execa 负责 BBDown 子进程生命周期，保留 GBK 原始流解码及现有 IPC 协议。
import { app, ipcMain, Notification, shell, clipboard } from 'electron';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import { execa } from 'execa';
import { state, AppPaths } from './state';
import { removeFromFavFolder } from './api';

function decodeChunk(decoder: TextDecoder, data: Buffer | string): string {
  return typeof data === 'string' ? data : decoder.decode(data, { stream: true });
}

async function inspectWithBBDown(downloaderPath: string, url: string): Promise<string> {
  const decoder = new TextDecoder('gbk');
  let output = '';

  const subprocess = execa(downloaderPath, [url, '--only-show-info'], {
    reject: false,
    timeout: 15000
  });

  subprocess.stdout?.on('data', data => {
    output += decodeChunk(decoder, data);
  });
  subprocess.stderr?.on('data', data => {
    output += decodeChunk(decoder, data);
  });

  try {
    await subprocess;
  } catch {
    // 超时或启动失败时保留已经捕获到的输出，供 BV 号兜底识别。
  }

  return output;
}

/** 注册下载控制、历史检查和队列完成通知。 */
export function setupDownloader() {
  ipcMain.handle('check-download-history', async (event, url: string) => {
    if (!url) return [];

    let existingHistory = '';
    try { existingHistory = fs.readFileSync(AppPaths.historyPath, 'utf8'); } catch {}
    const historySet = new Set(existingHistory.split('\n').map(s => s.trim()).filter(Boolean));
    const results: { bvid: string, aid?: number, title: string, isDownloaded: boolean }[] = [];

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Cookie': state.sessionCookie || '',
      'Referer': 'https://www.bilibili.com/',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Origin': 'https://www.bilibili.com',
      'Connection': 'keep-alive'
    };

    try {
      const mlMatch = url.match(/ml(\d+)/) || url.match(/fid=(\d+)/) || url.match(/^(\d+)$/);
      const midMatch = url.match(/space\.bilibili\.com\/(\d+)\/favlist/);

      let mediaId = mlMatch ? mlMatch[1] : null;
      if (!mediaId && midMatch && url.includes('favlist')) {
        const res = await axios.get(
          `https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=${midMatch[1]}`,
          { headers }
        );
        if (res.data.code === 0 && res.data.data.list?.length > 0) {
          mediaId = res.data.data.list[0].id;
        }
      }

      if (mediaId) {
        let totalProcessed = 0;
        const isMedialist = url.includes('ml') || url.includes('medialist');
        const apiUrl = isMedialist
          ? `https://api.bilibili.com/x/v1/medialist/resource/list?mlid=${mediaId}`
          : `https://api.bilibili.com/x/v3/fav/resource/list?media_id=${mediaId}`;

        event.sender.send(
          'download-progress',
          `>>> ⚙️ 使用 ${isMedialist ? 'Medialist(v1)' : 'FavFolder(v3)'} 协议扫描 ID: ${mediaId}\n`
        );

        for (let pn = 1; pn <= 100; pn++) {
          try {
            const res = await axios.get(`${apiUrl}&ps=20&pn=${pn}`, { headers, timeout: 8000 });

            if (res.data.code === 0 && (res.data.data.medias || res.data.data.list)) {
              const medias = res.data.data.medias || res.data.data.list || [];
              if (medias.length === 0) {
                event.sender.send('download-progress', `>>> ⏹️ 已分析至末尾 (总数: ${totalProcessed})\n`);
                break;
              }

              for (const m of medias) {
                totalProcessed++;
                const bvid = m.bv_id || m.bvid;
                const aid = m.id;
                if (!bvid) continue;

                const isDownloaded = historySet.has(bvid);
                if (!results.some(r => r.bvid === bvid)) {
                  results.push({ bvid, aid, title: m.title, isDownloaded });
                }
              }

              const missingCount = results.filter(r => !r.isDownloaded).length;
              event.sender.send(
                'download-progress',
                `>>> 📄 分析第 ${pn} 页: 当前已分析 ${totalProcessed} 个，发现 ${missingCount} 个未下载。\n`
              );

              if (missingCount >= 20) {
                event.sender.send('download-progress', '>>> ⚠️ 未下载列表达到 20 条阈值上限，暂停更深层的扫描。\n');
                break;
              }

              await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
            } else {
              event.sender.send('download-progress', `>>> ⚠️ 第 ${pn} 页数据格式异常或拉取失败\n`);
              break;
            }
          } catch (err: any) {
            event.sender.send('download-progress', `>>> ❌ 第 ${pn} 页拉取异常: ${err.message}\n`);
            break;
          }
        }
      }

      const urlBvidMatch = url.match(/BV[a-zA-Z0-9]{10}/);
      if (urlBvidMatch && results.length === 0) {
        const bvid = urlBvidMatch[0];
        const isDownloaded = historySet.has(bvid);
        results.push({ bvid, title: bvid, isDownloaded });
        event.sender.send(
          'download-progress',
          `>>> 🔍 已识别单视频: ${bvid} ${isDownloaded ? '(历史记录已存在)' : '(新任务)'}\n`
        );
      }

      if (results.length === 0) {
        const binDir = app.isPackaged
          ? path.join(process.resourcesPath, 'bin')
          : path.join(__dirname, '../bin');
        const downloaderPath = path.join(binDir, 'BBDown.exe');
        const infoOutput = await inspectWithBBDown(downloaderPath, url);

        const bvidMatches = infoOutput.match(/BV[a-zA-Z0-9]{10}/g);
        if (bvidMatches) {
          for (const bvid of new Set(bvidMatches)) {
            if (!results.some(r => r.bvid === bvid)) {
              results.push({ bvid, title: bvid, isDownloaded: historySet.has(bvid) });
            }
          }
        }
      }
    } catch (e) {
      console.error('Check history error:', e);
    }

    return results;
  });

  ipcMain.on('stop-download', () => {
    if (state.currentChild) {
      state.currentChild.kill();
      state.currentChild = null;
    }
  });

  ipcMain.on('queue-finished', () => {
    if (state.isNotifyEnabled && Notification.isSupported()) {
      new Notification({
        title: '🎉 所有任务已下载完成',
        body: '您的批量下载队列已全部处理完毕！',
        icon: path.join(__dirname, '../icon.ico')
      }).show();
    }

    if (state.isSoundEnabled) shell.beep();

    if (state.mainWindow && !state.mainWindow.isFocused()) {
      state.mainWindow.flashFrame(true);
    }
  });

  ipcMain.on(
    'start-download',
    (
      event,
      rawUrl,
      isBatch,
      dlSub,
      downloadDir,
      isSilent,
      isMultiThread,
      aid?: number,
      mediaId?: number
    ) => {
      if (!rawUrl) return;

      const binDir = app.isPackaged
        ? path.join(process.resourcesPath, 'bin')
        : path.join(__dirname, '../bin');
      const downloaderPath = path.join(binDir, 'BBDown.exe');
      const workDir = downloadDir || './downloads';
      const args = [rawUrl, '--work-dir', workDir];

      if (!dlSub) args.push('--skip-subtitle');

      if (isMultiThread) {
        args.push('-mt');
        event.sender.send('download-progress', '>>> ⚡ 已开启多线程分块下载，全力加速中...\n');
      }

      if (isBatch) {
        args.push('--file-pattern', '[<ownerName>] [<videoDate:yyyyMMdd>] <pageTitle> [<bvid>]');
        args.push('--multi-file-pattern', '[<ownerName>] [<videoDate:yyyyMMdd>] <pageTitle> [<bvid>]');
        args.push('-p', 'ALL');
      } else {
        args.push('--file-pattern', '[<ownerName>] [<videoDate:yyyyMMdd>] <videoTitle> [<bvid>]');
        args.push(
          '--multi-file-pattern',
          '[<ownerName>] [<videoDate:yyyyMMdd>] <videoTitle> - P<pageNumberWithZero> <pageTitle> [<bvid>]'
        );
      }

      if (state.sessionCookie) {
        args.push(
          '-ua',
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        );
        args.push('-c', state.sessionCookie);
      }

      state.currentChild?.kill();

      const child = execa(downloaderPath, args, { reject: false });
      state.currentChild = child as any;
      const decoder = new TextDecoder('gbk');

      child.stdout?.on('data', data => {
        const text = decodeChunk(decoder, data).replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
        event.sender.send('download-progress', text);
      });

      child.stderr?.on('data', data => {
        const text = decodeChunk(decoder, data).replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
        event.sender.send('download-progress', text);
      });

      void child
        .then(async result => {
          const code = result.exitCode;

          if (state.currentChild === (child as any)) {
            state.currentChild = null;
          }

          await syncDownloadHistory(workDir, rawUrl, code === 0);

          if (code === 0 && aid && mediaId && state.unfavAfterDownload) {
            const removeResult = await removeFromFavFolder(aid, mediaId);
            if (removeResult.success) {
              event.sender.send('download-progress', `>>> 🗑️ 已从收藏夹移除: ${rawUrl}\n`);
            } else {
              event.sender.send(
                'download-progress',
                `>>> ⚠️ 取消收藏失败 (${rawUrl}): ${removeResult.message}\n`
              );
            }
          }

          if (code === 0 && isSilent) {
            clipboard.writeText(`Enhancer_Download_Finished||${rawUrl}`);
          }

          event.sender.send('download-complete', code);
        })
        .catch(err => {
          if (state.currentChild === (child as any)) {
            state.currentChild = null;
          }
          console.error('启动失败:', err);
          event.sender.send(
            'download-progress',
            `>>> ❌ 启动失败: ${err.message}\n请检查 bin 目录下是否有 BBDown.exe`
          );
          event.sender.send('download-complete', null);
        });
    }
  );
}

async function syncDownloadHistory(
  workDir: string,
  rawUrl: string,
  forceAddUrlBv: boolean = false
) {
  try {
    const syncDir = workDir || './downloads';
    if (!fs.existsSync(syncDir)) return;

    const files = await fs.promises.readdir(syncDir);
    const historyPath = AppPaths.historyPath;

    let existingHistory = '';
    try { existingHistory = await fs.promises.readFile(historyPath, 'utf8'); } catch {}

    const lines = existingHistory.split('\n').map(s => s.trim()).filter(Boolean);
    const existingSet = new Set(lines);
    let changed = false;

    if (forceAddUrlBv) {
      const rawBvidMatch = rawUrl.match(/BV[a-zA-Z0-9]{10}/);
      if (rawBvidMatch) {
        const bvid = rawBvidMatch[0];
        if (!existingSet.has(bvid)) {
          existingSet.add(bvid);
          changed = true;
        }
      }
    }

    for (const file of files) {
      if (!file.match(/\.(mp4|flv|mkv|mp3|m4a)$/i)) continue;
      const bvidMatch = file.match(/BV[a-zA-Z0-9]{10}/);
      if (bvidMatch && !existingSet.has(bvidMatch[0])) {
        existingSet.add(bvidMatch[0]);
        changed = true;
      }
    }

    if (changed) {
      await fs.promises.writeFile(historyPath, Array.from(existingSet).join('\n') + '\n', 'utf8');
    }
  } catch (e) {
    console.error('Sync BV history error:', e);
  }
}
