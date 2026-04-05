import { app, ipcMain, Notification, shell, clipboard } from 'electron';
import path from 'path';
import { spawn } from 'child_process';
import fs from 'fs';
import { state, AppPaths } from './state';

export function setupDownloader() {
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
