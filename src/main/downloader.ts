import { app, ipcMain, Notification, shell, clipboard } from 'electron';
import path from 'path';
import { spawn } from 'child_process';
import fs from 'fs';
import axios from 'axios';
import { state, AppPaths } from './state';

export function setupDownloader() {
  // 【完善】多维预检查下载历史逻辑
  ipcMain.handle('check-download-history', async (event, url: string) => {
    if (!url) return [];
    
    // 1. 加载现有历史记录
    let existingHistory = '';
    try { existingHistory = fs.readFileSync(AppPaths.historyPath, 'utf8'); } catch (e) {}
    const historySet = new Set(existingHistory.split('\n').map(s => s.trim()).filter(Boolean));
    const results: { bvid: string, title: string, isDownloaded: boolean }[] = [];

    const headers = { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36',
        'Cookie': state.sessionCookie || ''
    };

    try {
        // --- 策略 A: 识别常见的 B 站列表 URL 并直接调 API (秒开且覆盖率高) ---
        
        // 收藏夹 (favlist / medialist/play/ml)
        const mlMatch = url.match(/ml(\d+)/) || url.match(/fid=(\d+)/);
        const midMatch = url.match(/space\.bilibili\.com\/(\d+)\/favlist/);
        
        let mediaId = mlMatch ? mlMatch[1] : null;
        if (!mediaId && midMatch) {
            // 如果是个人收藏页，先查出默认收藏夹 ID
            const res = await axios.get(`https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=${midMatch[1]}`, { headers });
            if (res.data.code === 0 && res.data.data.list?.length > 0) {
                mediaId = res.data.data.list[0].id;
            }
        }

        if (mediaId) {
            // 获取收藏夹内 BV (分多页抓取，这里默认抓取前 5 页合计 100 个视频，兼顾性能与覆盖)
            for (let pn = 1; pn <= 5; pn++) {
                const res = await axios.get(`https://api.bilibili.com/x/v3/fav/resource/list?media_id=${mediaId}&ps=20&pn=${pn}`, { headers });
                if (res.data.code === 0 && res.data.data.medias) {
                    for (const m of res.data.data.medias) {
                        if (!results.some(r => r.bvid === m.bv_id)) {
                            results.push({
                                bvid: m.bv_id,
                                title: m.title,
                                isDownloaded: historySet.has(m.bv_id)
                            });
                        }
                    }
                    // 如果这页没满，说明后面没了
                    if (res.data.data.medias.length < 20) break;
                } else {
                    break;
                }
            }
        }

        // --- 策略 B: 单视频 BV 号直接提取 (无视 BBDown 是否报错) ---
        const urlBvidMatch = url.match(/BV[a-zA-Z0-9]{10}/i);
        if (urlBvidMatch) {
            const bvid = urlBvidMatch[0];
            if (!results.some(r => r.bvid === bvid)) {
                results.push({
                    bvid,
                    title: bvid,
                    isDownloaded: historySet.has(bvid)
                });
            }
        }

        // --- 策略 C: 兜底使用 BBDown --only-show-info ---
        // 只有当 A/B 都没结果，或者可能存在多P/合集时才使用
        if (results.length === 0) {
            const binDir = app.isPackaged ? path.join(process.resourcesPath, 'bin') : path.join(__dirname, '../bin');
            const downloaderPath = path.join(binDir, 'BBDown.exe');

            const infoOutput = await new Promise<string>((resolve) => {
                const child = spawn(downloaderPath, [url, '--only-show-info']);
                const decoder = new TextDecoder('gbk');
                let out = '';

                child.stdout.on('data', (d) => out += decoder.decode(d));
                child.stderr.on('data', (d) => out += decoder.decode(d));
                child.on('close', () => resolve(out));
                setTimeout(() => { child.kill(); resolve(out); }, 10000); // 10秒强制超时保护
            });

            const bvidMatches = infoOutput.match(/BV[a-zA-Z0-9]{10}/ig);
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

    if (state.isSoundEnabled) {
        shell.beep();
    }

    if (state.mainWindow && !state.mainWindow.isFocused()) {
        state.mainWindow.flashFrame(true);
    }
  });

  ipcMain.on('start-download', (event, rawUrl, isBatch, dlSub, downloadDir, isSilent, isMultiThread) => {
    if (!rawUrl) return;

    const binDir = app.isPackaged 
        ? path.join(process.resourcesPath, 'bin') 
        : path.join(__dirname, '../bin');
        
    const downloaderPath = path.join(binDir, 'BBDown.exe');
    const workDir = downloadDir ? downloadDir : './downloads';
    const args = [ rawUrl, '--work-dir', workDir ];

    if (!dlSub) {
        args.push('--skip-subtitle');
    }



    if (isMultiThread) {
        args.push('-mt');
        event.sender.send('download-progress', `>>> ⚡ 已开启多线程分块下载，全力加速中...\n`);
    }

    if (isBatch) {
        args.push('--file-pattern', '<pageTitle> [<bvid>]');
        args.push('--multi-file-pattern', '<pageTitle> [<bvid>]');
        args.push('-p', 'ALL'); 
    } else {
        args.push('--file-pattern', '<videoTitle> [<bvid>]');
        args.push('--multi-file-pattern', '<videoTitle> - P<pageNumberWithZero> <pageTitle> [<bvid>]');
    }

    if (state.sessionCookie) args.push('-c', state.sessionCookie);

    if (state.currentChild) {
        state.currentChild.kill();
    }

    state.currentChild = spawn(downloaderPath, args);
    const child = state.currentChild; 
    const decoder = new TextDecoder('gbk'); 
    
    if (child.stdout) {
        child.stdout.on('data', (data) => {
          let text = decoder.decode(data).replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
          event.sender.send('download-progress', text);
        });
    }
    
    if (child.stderr) {
        child.stderr.on('data', (data) => {
          let text = decoder.decode(data).replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
          event.sender.send('download-progress', text);
        });
    }
    
    child.on('close', async (code) => {
        if (state.currentChild === child) {
            state.currentChild = null;
        }
        
        await syncDownloadHistory(workDir, rawUrl);

        if (code === 0 && isSilent) {
            clipboard.writeText(`Enhancer_Download_Finished||${rawUrl}`);
        }
        
        event.sender.send('download-complete', code);
    });
    
    child.on('error', (err) => {
        console.error('启动失败:', err);
        event.sender.send('download-progress', `>>> ❌ 启动失败: ${err.message}\n请检查 bin 目录下是否有 BBDown.exe`);
    });
  });
}

// 修复后的历史记录提取
async function syncDownloadHistory(workDir: string, rawUrl: string) {
    try {
        const syncDir = workDir || './downloads';
        if (fs.existsSync(syncDir)) {
            const files = await fs.promises.readdir(syncDir);
            const historyPath = AppPaths.historyPath;
            
            let existingHistory = '';
            try { existingHistory = await fs.promises.readFile(historyPath, 'utf8'); } catch (e) {}
            
            const lines = existingHistory.split('\n').map(s => s.trim()).filter(Boolean);
            const existingSet = new Set(lines);
            let addedBvids = false;
            
            const rawBvidMatch = rawUrl.match(/BV[a-zA-Z0-9]{10}/i);
            if (rawBvidMatch && !existingSet.has(rawBvidMatch[0])) {
                existingSet.add(rawBvidMatch[0]);
                addedBvids = true;
            }
            
            for (const file of files) {
                if (file.match(/\.(mp4|flv|mkv|mp3|m4a)$/i)) {
                    const bvidMatch = file.match(/BV[a-zA-Z0-9]{10}/i);
                    if (bvidMatch) {
                        const bvid = bvidMatch[0];
                        if (!existingSet.has(bvid)) {
                            existingSet.add(bvid);
                            addedBvids = true;
                        }
                    }
                }
            }
            
            if (addedBvids) {
                // 安全写入，用换行符显式 join 避免末尾无换行引起的拼接粘连
                await fs.promises.writeFile(historyPath, Array.from(existingSet).join('\n') + '\n', 'utf8');
            }
        }
    } catch (e) {
        console.error('Sync BV history error:', e);
    }
}
