// 主进程下载模块：管理 BBDown 下载与历史同步，复用 api.ts 在下载成功后取消收藏。
import { app, ipcMain, Notification, shell, clipboard } from 'electron';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import { execa } from 'execa';
import fg from 'fast-glob';
import { state, AppPaths } from './state';
import { removeFromFavFolder } from './api';
import { getSetting, getSettings } from './settings';
import { getCookie } from './auth';

/** 按流解码 GBK，保留跨数据块的多字节字符。 */
function decodeChunk(decoder: TextDecoder, data: Buffer | string): string {
  return typeof data === 'string' ? data : decoder.decode(data, { stream: true });
}

/** 获取 BBDown 元数据，启动失败或超时交给调用方明确记录。 */
async function inspectWithBBDown(downloaderPath: string, url: string): Promise<string> {
  const result = await execa(downloaderPath, [url, '--only-show-info'], {
    timeout: 15000,
    all: true,
    encoding: null,
    windowsHide: true
  });
  return new TextDecoder('gbk').decode(result.all ?? new Uint8Array());
}

/** 注册下载控制、历史检查和队列完成通知。 */
export function setupDownloader() {
  // 【完善】多维预检查下载历史逻辑
  ipcMain.handle('check-download-history', async (event, url: string) => {
    if (!url) return [];
    
    // 1. 加载现有历史记录
    let existingHistory = '';
    try { existingHistory = fs.readFileSync(AppPaths.historyPath, 'utf8'); } catch (e) {}
    const historySet = new Set(existingHistory.split('\n').map(s => s.trim()).filter(Boolean));
    const results: { bvid: string, aid?: number, title: string, isDownloaded: boolean }[] = [];

    const headers = { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Cookie': getCookie() || '',
        'Referer': 'https://www.bilibili.com/',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Origin': 'https://www.bilibili.com',
        'Connection': 'keep-alive'
    };

    try {
        // --- 策略 A: 识别常见的 B 站列表 URL 并直接调 API (支持翻页且含阈值) ---
        
        // 匹配逻辑：ml号, fid=号, 或者是纯数字的 fid
        const mlMatch = url.match(/ml(\d+)/) || url.match(/fid=(\d+)/) || url.match(/^(\d+)$/);
        const midMatch = url.match(/space\.bilibili\.com\/(\d+)\/favlist/);
        
        let mediaId = mlMatch ? mlMatch[1] : null;
        // 只有当 URL 包含 space/favlist 字样时才尝试空间接口，避免普通视频 ID 误撞
        if (!mediaId && midMatch && url.includes('favlist')) {
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
                            // v1 与 v3 的字段可能略有不同
                            const bvid = m.bv_id || m.bvid;
                            const aid = m.id; // B 站 API 通常 id 就是 aid
                            if (!bvid) continue;

                            const isDownloaded = historySet.has(bvid);
                            const isNewInResults = !results.some(r => r.bvid === bvid);
                            
                            if (isNewInResults) {
                                results.push({
                                    bvid: bvid,
                                    aid: aid,
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

                        // [防风控] 每翻一页，稍微喘口气 (600ms 随机延迟)
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

        // --- 策略 B: 单视频 BV 号直接提取 (单任务不涉及翻页) ---
        const urlBvidMatch = url.match(/BV[a-zA-Z0-9]{10}/);
        if (urlBvidMatch && results.length === 0) {
            const bvid = urlBvidMatch[0];
            const isDownloaded = historySet.has(bvid);
            results.push({
                bvid,
                title: bvid,
                isDownloaded
            });
            event.sender.send('download-progress', `>>> 🔍 已识别单视频: ${bvid} ${isDownloaded ? '(历史记录已存在)' : '(新任务)'}\n`);
        }

        // --- 策略 C: 兜底使用 BBDown (仅在 A/B 无结论时执行) ---
        if (results.length === 0) {
            const binDir = app.isPackaged ? path.join(process.resourcesPath, 'bin') : path.join(__dirname, '../bin');
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
    if (getSettings().notifyState && Notification.isSupported()) {
        new Notification({
            title: '🎉 所有任务已下载完成',
            body: '您的批量下载队列已全部处理完毕！',
            icon: path.join(__dirname, '../icon.ico')
        }).show();
    }

    if (getSettings().soundState) {
        shell.beep();
    }

    if (state.mainWindow && !state.mainWindow.isFocused()) {
        state.mainWindow.flashFrame(true);
    }
  });

  ipcMain.on('start-download', (event, rawUrl, isBatch, isSilent, aid?: number, mediaId?: number) => {
    if (!rawUrl) return;

    const { dlSub, downloadDir, multiThread } = getSettings();
    const binDir = app.isPackaged 
        ? path.join(process.resourcesPath, 'bin') 
        : path.join(__dirname, '../bin');
        
    const downloaderPath = path.join(binDir, 'BBDown.exe');
    const workDir = downloadDir ? downloadDir : './downloads';
    const args = [ rawUrl, '--work-dir', workDir ];

    if (!dlSub) {
        args.push('--skip-subtitle');
    }



    if (multiThread) {
        args.push('-mt');
        event.sender.send('download-progress', `>>> ⚡ 已开启多线程分块下载，全力加速中...\n`);
    }

    if (isBatch) {
        args.push('--file-pattern', '[<ownerName>] [<videoDate:yyyyMMdd>] <pageTitle> [<bvid>]');
        args.push('--multi-file-pattern', '[<ownerName>] [<videoDate:yyyyMMdd>] <pageTitle> [<bvid>]');
        args.push('-p', 'ALL'); 
    } else {
        args.push('--file-pattern', '[<ownerName>] [<videoDate:yyyyMMdd>] <videoTitle> [<bvid>]');
        args.push('--multi-file-pattern', '[<ownerName>] [<videoDate:yyyyMMdd>] <videoTitle> - P<pageNumberWithZero> <pageTitle> [<bvid>]');
    }

    if (getCookie()) {
        args.push('-ua', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        args.push('-c', getCookie());
    }

    state.currentChild?.kill();

    // 输出由进度事件实时消费，禁用 execa 缓冲以免长任务达到输出上限被中止。
    const child = execa(downloaderPath, args, { reject: false, buffer: false, windowsHide: true });
    state.currentChild = child;
    const stdoutDecoder = new TextDecoder('gbk');
    const stderrDecoder = new TextDecoder('gbk');

    child.stdout?.on('data', data => {
        event.sender.send('download-progress', decodeChunk(stdoutDecoder, data).replace(/\x1B\[[0-9;]*[a-zA-Z]/g, ''));
    });
    child.stderr?.on('data', data => {
        event.sender.send('download-progress', decodeChunk(stderrDecoder, data).replace(/\x1B\[[0-9;]*[a-zA-Z]/g, ''));
    });

    void child.then(async result => {
        // reject:false 时启动失败也会 resolve，必须显式报告错误并统一完成事件类型。
        const code = result.exitCode ?? null;
        if (state.currentChild === child) state.currentChild = null;
        if ('code' in result && result.code) {
            // execa 的 shortMessage 包含完整命令及 Cookie，仅公开系统错误码。
            event.sender.send('download-progress', `>>> ❌ 启动失败 (${String(result.code)})\n请检查 bin 目录下是否有 BBDown.exe\n`);
        }

        await syncDownloadHistory(workDir, rawUrl, code === 0);

        if (code === 0 && aid && mediaId && getSetting('unfavAfterDownload')) {
            const unfav = await removeFromFavFolder(aid, mediaId);
            event.sender.send(
                'download-progress',
                unfav.success
                    ? `>>> 🗑️ 已从收藏夹移除: ${rawUrl}\n`
                    : `>>> ⚠️ 取消收藏失败 (${rawUrl}): ${unfav.message}\n`
            );
        }

        if (code === 0 && isSilent) {
            clipboard.writeText(`Enhancer_Download_Finished||${rawUrl}`);
        }
        event.sender.send('download-complete', code);
    }).catch(err => {
        if (state.currentChild === child) state.currentChild = null;
        // 不输出携带 Cookie 的完整 execa 命令。
        const message = err.originalMessage ?? err.code ?? (err.command ? '下载执行失败' : err.message);
        console.error('下载执行失败:', message);
        event.sender.send('download-progress', `>>> ❌ 下载执行失败: ${message}\n`);
        event.sender.send('download-complete', null);
    });
  });
}

/** 同步成功任务和目录中的已完成媒体，取消批量任务也保留已下载条目。 */
async function syncDownloadHistory(workDir: string, rawUrl: string, forceAddUrlBv = false) {
    try {
        const files = await fg('**/*.{mp4,flv,mkv,mp3,m4a}', {
            cwd: workDir || './downloads',
            onlyFiles: true,
            dot: true,
            caseSensitiveMatch: false
        });

        let existing = '';
        try { existing = await fs.promises.readFile(AppPaths.historyPath, 'utf8'); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }

        const history = new Set(existing.split(/\r?\n/).map(s => s.trim()).filter(Boolean));
        const before = history.size;

        // 成功的单视频任务必须入历史；失败任务只采集实体文件。
        if (forceAddUrlBv) {
            const bvid = rawUrl.match(/BV[a-zA-Z0-9]{10}/)?.[0];
            if (bvid) history.add(bvid);
        }

        // 只读取文件名中的 BV，父目录的 BV 不能代表其全部媒体。
        for (const file of files) {
            const bvid = path.basename(file).match(/BV[a-zA-Z0-9]{10}/)?.[0];
            if (bvid) history.add(bvid);
        }

        if (history.size !== before) {
            await fs.promises.writeFile(AppPaths.historyPath, [...history].join('\n') + '\n', 'utf8');
        }
    } catch (error) {
        console.error('Sync BV history error:', error);
    }
}
