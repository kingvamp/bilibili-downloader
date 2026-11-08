// 主进程下载服务：直接执行查重、BBDown 和历史同步，由 DownloadManager 统一控制生命周期。
// 关联：downloadRuntime.ts 注入服务；history.ts 读取历史；downloadProgress.ts 解析明确的分P进度。
import { app, clipboard } from 'electron';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import { execa, type ExecaChildProcess } from 'execa';
import fg from 'fast-glob';
import { AppPaths } from './state';
import { removeFromFavFolder } from './api';
import { getSetting, getSettings } from './settings';
import { getCookie } from './auth';
import { readDownloadHistory } from './history';
import { createDownloadProgressParser } from './downloadProgress';
import type { DownloadTask, DuplicateResult, DownloadProgress, DownloadExecution } from '../shared/download';

interface FavoriteSource {
  id: string | null;
  ownerId: string | null;
  medialist: boolean;
}

/** 统一解析开发环境与安装目录中的 BBDown 路径。 */
function downloaderPath(): string {
  const binDir = app.isPackaged ? path.join(process.resourcesPath, 'bin') : path.join(__dirname, '../bin');
  return path.join(binDir, 'BBDown.exe');
}

/** 按流解码 GBK，保留跨数据块的多字节字符。 */
function decodeChunk(decoder: TextDecoder, data: Buffer | string): string {
  return typeof data === 'string' ? data : decoder.decode(data, { stream: true });
}

/** execa 错误可能包含完整命令和 Cookie，只公开其系统错误码。 */
function downloadErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return '下载执行失败';
  const processError = error as Error & { command?: string; code?: string };
  return processError.command ? processError.code || 'BBDown 执行失败' : processError.message;
}

/** 获取其他受 BBDown 支持的输入元数据，失败时直接交给流程记录。 */
async function inspectWithBBDown(url: string): Promise<string> {
  const result = await execa(downloaderPath(), [url, '--only-show-info'], {
    timeout: 15000,
    all: true,
    encoding: null,
    windowsHide: true
  });
  if (!result.all?.length) throw new Error('BBDown 未返回视频元数据');
  return new TextDecoder('gbk').decode(result.all);
}

/** 分页查询已识别的收藏夹；任何请求或结构错误都不得返回部分扫描结果。 */
async function inspectFavorites(source: FavoriteSource, history: Set<string>, log: (message: string) => void): Promise<DuplicateResult[]> {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Cookie': getCookie(),
    'Referer': 'https://www.bilibili.com/',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Origin': 'https://www.bilibili.com',
    'Connection': 'keep-alive'
  };
  let mediaId = source.id;
  if (!mediaId) {
    const res = await axios.get(`https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=${source.ownerId}`, { headers, timeout: 8000 });
    if (res.data?.code !== 0) throw new Error(`获取收藏夹失败：${res.data?.message || '接口未返回成功结果'}`);
    const folders = res.data.data?.list;
    if (!Array.isArray(folders)) throw new Error('收藏夹列表数据格式异常');
    if (!folders.length) return [];
    if (!Number.isSafeInteger(folders[0]?.id) || folders[0].id <= 0) throw new Error('收藏夹 ID 数据格式异常');
    mediaId = String(folders[0].id);
  }

  const apiUrl = source.medialist
    ? `https://api.bilibili.com/x/v1/medialist/resource/list?mlid=${mediaId}`
    : `https://api.bilibili.com/x/v3/fav/resource/list?media_id=${mediaId}`;
  log(`>>> ⚙️ 使用 ${source.medialist ? 'Medialist(v1)' : 'FavFolder(v3)'} 协议扫描 ID: ${mediaId}\n`);
  const results: DuplicateResult[] = [];
  const seen = new Set<string>();
  let totalProcessed = 0;
  for (let page = 1; page <= 100; page++) {
    const res = await axios.get(`${apiUrl}&ps=20&pn=${page}`, { headers, timeout: 8000 });
    if (res.data?.code !== 0) throw new Error(`收藏夹第 ${page} 页拉取失败：${res.data?.message || '接口未返回成功结果'}`);
    // 保留现有接口已支持的两组字段；缺失或格式错误仍明确失败。
    const medias = res.data.data?.medias || res.data.data?.list;
    if (!Array.isArray(medias)) throw new Error(`收藏夹第 ${page} 页数据格式异常`);
    if (!medias.length) {
      log(`>>> ⏹️ 已分析至末尾 (总数: ${totalProcessed})\n`);
      return results;
    }
    for (const media of medias) {
      const bvid = media?.bv_id || media?.bvid;
      if (typeof bvid !== 'string' || !/^BV[a-zA-Z0-9]{10}$/.test(bvid)
        || !Number.isSafeInteger(media.id) || media.id <= 0 || typeof media.title !== 'string') {
        throw new Error(`收藏夹第 ${page} 页视频数据格式异常`);
      }
      totalProcessed++;
      if (!seen.has(bvid)) {
        seen.add(bvid);
        results.push({ bvid, aid: media.id, title: media.title, isDownloaded: history.has(bvid) });
      }
    }
    const missingCount = results.filter(item => !item.isDownloaded).length;
    log(`>>> 📄 分析第 ${page} 页: 当前已分析 ${totalProcessed} 个，发现 ${missingCount} 个未下载。\n`);
    if (missingCount >= 20) {
      log('>>> ⚠️ 未下载列表达到 20 条阈值上限，暂停更深层的扫描。\n');
      return results;
    }
    // 保留既有翻页间隔，避免连续发送请求。
    if (page < 100) await new Promise(resolve => setTimeout(resolve, 600 + Math.random() * 400));
  }
  log('>>> ⚠️ 已达到 100 页扫描上限，本次扫描结束。\n');
  return results;
}

/** 按输入类型选择唯一解析路径；已识别收藏夹的空结果或错误不会再改用其他解析器。 */
export async function inspectHistory(url: string, log: (message: string) => void): Promise<DuplicateResult[]> {
  if (!url.trim()) throw new Error('下载地址不能为空');
  const history = readDownloadHistory();
  const favoriteId = url.match(/ml(\d+)/) || url.match(/fid=(\d+)/) || url.match(/^(\d+)$/);
  const ownerId = url.match(/space\.bilibili\.com\/(\d+)\/favlist/);
  if (favoriteId || ownerId) {
    return inspectFavorites({
      id: favoriteId?.[1] ?? null,
      ownerId: ownerId?.[1] ?? null,
      medialist: url.includes('ml') || url.includes('medialist')
    }, history, log);
  }

  const bvid = url.match(/BV[a-zA-Z0-9]{10}/)?.[0];
  if (bvid) {
    const isDownloaded = history.has(bvid);
    log(`>>> 🔍 已识别单视频: ${bvid} ${isDownloaded ? '(历史记录已存在)' : '(新任务)'}\n`);
    return [{ bvid, title: bvid, isDownloaded }];
  }

  const output = await inspectWithBBDown(url);
  const matches = output.match(/BV[a-zA-Z0-9]{10}/g);
  if (!matches?.length) throw new Error('BBDown 元数据中未找到有效视频 ID');
  return [...new Set(matches)].map(id => ({ bvid: id, title: id, isDownloaded: history.has(id) }));
}

/** 执行单个任务；取消绑定本次子进程，历史同步和取消收藏结束后 Promise 才结算。 */
export function executeDownload(task: DownloadTask, log: (message: string) => void, onProgress: (progress: DownloadProgress) => void): DownloadExecution {
  if (!task.url.trim()) throw new Error('下载地址不能为空');
  const { dlSub, downloadDir, multiThread } = getSettings();
  const args = [task.url, '--work-dir', downloadDir];
  if (!dlSub) args.push('--skip-subtitle');
  if (multiThread) {
    args.push('-mt');
    log('>>> ⚡ 已开启多线程分块下载，全力加速中...\n');
  }
  const isBatch = /^\d+$/.test(task.url) || task.url.includes('list/ml') || task.url.includes('favlist');
  if (isBatch) {
    args.push('--file-pattern', '[<ownerName>] [<videoDate:yyyyMMdd>] <pageTitle> [<bvid>]');
    args.push('--multi-file-pattern', '[<ownerName>] [<videoDate:yyyyMMdd>] <pageTitle> [<bvid>]');
    args.push('-p', 'ALL');
  } else {
    args.push('--file-pattern', '[<ownerName>] [<videoDate:yyyyMMdd>] <videoTitle> [<bvid>]');
    args.push('--multi-file-pattern', '[<ownerName>] [<videoDate:yyyyMMdd>] <videoTitle> - P<pageNumberWithZero> <pageTitle> [<bvid>]');
  }
  const cookie = getCookie();
  if (cookie) {
    args.push('-ua', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    args.push('-c', cookie);
  }

  // 输出由进度事件实时消费，禁用 execa 缓冲以免长任务达到输出上限被中止。
  let child: ExecaChildProcess;
  try {
    child = execa(downloaderPath(), args, { reject: false, buffer: false, windowsHide: true });
  } catch (error) {
    throw new Error(downloadErrorMessage(error));
  }
  // buffer:false 的 execa Promise 只等待退出；close 才保证两路输出已经关闭。
  const outputClosed = new Promise<void>(resolve => { child.once('close', () => resolve()); });
  const stdoutDecoder = new TextDecoder('gbk');
  const stderrDecoder = new TextDecoder('gbk');
  const progress = createDownloadProgressParser(onProgress);
  const consume = (stream: 'stdout' | 'stderr', text: string) => {
    if (!text) return;
    log(text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, ''));
    progress.write(stream, text);
  };
  child.stdout?.on('data', data => consume('stdout', decodeChunk(stdoutDecoder, data)));
  child.stderr?.on('data', data => consume('stderr', decodeChunk(stderrDecoder, data)));

  const promise = child.then(async result => {
    await outputClosed;
    consume('stdout', stdoutDecoder.decode());
    consume('stderr', stderrDecoder.decode());
    progress.finish();
    // reject:false 时启动失败也会 resolve，必须显式报告系统错误码。
    const code = result.exitCode ?? null;
    if ('code' in result && result.code) {
      log(`>>> ❌ 启动失败 (${String(result.code)})\n请检查 bin 目录下是否有 BBDown.exe\n`);
    }
    await syncDownloadHistory(downloadDir, task.url, code === 0);
    if (code === 0 && task.aid && task.mediaId && getSetting('unfavAfterDownload')) {
      const unfav = await removeFromFavFolder(task.aid, task.mediaId);
      log(unfav.success
        ? `>>> 🗑️ 已从收藏夹移除: ${task.url}\n`
        : `>>> ⚠️ 取消收藏失败 (${task.url}): ${unfav.message}\n`);
    }
    if (code === 0 && task.isSilent) clipboard.writeText(`Enhancer_Download_Finished||${task.url}`);
    return code;
  }).catch(error => {
    const message = downloadErrorMessage(error);
    console.error('下载执行失败:', message);
    log(`>>> ❌ 下载执行失败: ${message}\n`);
    return null;
  });
  return { promise, cancel: () => { child.kill(); } };
}

/** 同步成功任务和目录中的已完成媒体，取消批量任务也保留已下载条目；失败由执行流程报告。 */
async function syncDownloadHistory(workDir: string, rawUrl: string, forceAddUrlBv: boolean): Promise<void> {
  const files = await fg('**/*.{mp4,flv,mkv,mp3,m4a}', {
    cwd: workDir,
    onlyFiles: true,
    dot: true,
    caseSensitiveMatch: false
  });
  const history = readDownloadHistory();
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
}
