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
        // --- 策略 A: 识别常见的 B 站列表 URL 并直接调 API (支持翻页且含阈值) ---
        
        // 匹配逻辑：ml号, fid=号, 或者是纯数字的 fid
        const mlMatch = url.match(/ml(\d+)/) || url.match(/fid=(\d+)/) || url.match(/^(\d+)$/);
        const midMatch = url.match(/space\.bilibili\.com\/(\d+)\/favlist/);
        
        let mediaId = mlMatch ? mlMatch[1] : null;
        if (!mediaId && midMatch) {
            const res = await axios.get(`https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=${midMatch[1]}`, { headers });
            if (res.data.code === 0 && res.data.data.list?.length > 0) {
                mediaId = res.data.data.list[0].id;
            }
        }

        if (mediaId) {
            // 记录扫描结果
            let totalProcessed = 0;
            // 判断是否为新版 Medialist (ml开头通常为 medialist)
            const isMedialist = url.includes('ml') || url.includes('medialist');
            const apiUrl = isMedialist 
                ? `https://api.bilibili.com/x/v1/medialist/resource/list?mlid=${mediaId}`
                : `https://api.bilibili.com/x/v3/fav/resource/list?media_id=${mediaId}`;

            event.sender.send('download-progress', `>>> ⚙️ 使用 ${isMedialist ? 'Medialist(v1)' : 'FavFolder(v3)'} 协议扫描 ID: ${mediaId}\n`);

            for (let pn = 1; pn <= 100; pn++) {
                try {
                    const res = await axios.get(`${apiUrl}&ps=20&pn=${pn}`, { headers, timeout: 8000 });
                    
                    if (res.data.code === 0 && (res.data.data.medias || res.data.data.list)) {
                        // v1/medialist 使用 data.list, v3/fav 使用 data.medias
                        const medias = res.data.data.medias || res.data.data.list || [];
                        
                        if (medias.length === 0) {
                            event.sender.send('download-progress', `>>> ⏹️ 已分析至末尾 (总数: ${totalProcessed})\n`);
                            break;
                        }

                        for (const m of medias) {
                            totalProcessed++;
                            // v1 与 v3 的字段可能略有不同，v3 是 bv_id, v1 可能是 bv_id
                            const bvid = m.bv_id || m.bvid;
                            if (!bvid) continue;

                            const isDownloaded = historySet.has(bvid);
                            const isNewInResults = !results.some(r => r.bvid.toUpperCase() === bvid.toUpperCase());
                            
                            if (isNewInResults) {
                                results.push({
                                    bvid: bvid,
                                    title: m.title,
                                    isDownloaded
                                });
                            }
                        }

                        const missingCount = results.filter(r => !r.isDownloaded).length;
                        event.sender.send('download-progress', `>>> 📄 分析第 ${pn} 页: 当前已分析 ${totalProcessed} 个，发现 ${missingCount} 个未下载。\n`);

                        if (missingCount >= 20) {
                            event.sender.send('download-progress', `>>> ⚠️ 未下载列表达到 20 条阈值上限，暂停更深层的扫描。\n`);
                            break;
                        }

                        // 不要在这里 break，有些 API 返回不满 ps 之后可能还有
                        // 统一在开头 medias.length === 0 处退出
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

        // --- 策略 B: 单视频 BV 号直接提取 (单任务不涉及翻页) ---
        const urlBvidMatch = url.match(/BV[a-zA-Z0-9]{10}/i);
        if (urlBvidMatch && results.length === 0) {
            const bvid = urlBvidMatch[0];
            results.push({
                bvid,
                title: bvid,
                isDownloaded: historySet.has(bvid)
            });
        }

        // --- 策略 C: 兜底使用 BBDown (仅在 A/B 无结论时执行) ---
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
                setTimeout(() => { child.kill(); resolve(out); }, 15000); 
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
        
        // 任何退出状态（包括手动停止）都执行一次目录扫描，同步已完成的文件 BV
        // 只有在 code === 0 时，才允许将 URL 对应的 BV 绝对写入历史
        await syncDownloadHistory(workDir, rawUrl, code === 0);

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

// 修复后的历史记录提取：增加 forceAddUrlBv 判定
async function syncDownloadHistory(workDir: string, rawUrl: string, forceAddUrlBv: boolean = false) {
    try {
        const syncDir = workDir || './downloads';
        if (fs.existsSync(syncDir)) {
            const files = await fs.promises.readdir(syncDir);
            const historyPath = AppPaths.historyPath;
            
            let existingHistory = '';
            try { existingHistory = await fs.promises.readFile(historyPath, 'utf8'); } catch (e) {}
            
            const lines = existingHistory.split('\n').map(s => s.trim()).filter(Boolean);
            const existingSet = new Set(lines);
            let changed = false;
            
            // 1. 如果任务彻底完成 (code 0)，且输入是单视频 URL，确保将其记入历史
            if (forceAddUrlBv) {
                const rawBvidMatch = rawUrl.match(/BV[a-zA-Z0-9]{10}/i);
                if (rawBvidMatch && !existingSet.has(rawBvidMatch[0])) {
                    existingSet.add(rawBvidMatch[0]);
                    changed = true;
                }
            }
            
            // 2. 始终扫描目录内的实体文件。这对于“下载收藏夹中途取消”非常有用：
            // 虽然进程 code 不是 0，但前 5 个已经下完的 mp4 文件名里带有 BV 号，会被扫入历史。
            for (const file of files) {
                if (file.match(/\.(mp4|flv|mkv|mp3|m4a)$/i)) {
                    const bvidMatch = file.match(/BV[a-zA-Z0-9]{10}/i);
                    if (bvidMatch) {
                        const bvid = bvidMatch[0];
                        if (!existingSet.has(bvid)) {
                            existingSet.add(bvid);
                            changed = true;
                        }
                    }
                }
            }
            
            if (changed) {
                await fs.promises.writeFile(historyPath, Array.from(existingSet).join('\n') + '\n', 'utf8');
            }
        }
    } catch (e) {
        console.error('Sync BV history error:', e);
    }
}
