// 默认收藏夹流程：在 useDownload 已取得执行权后查询、扫描、清理历史并建立下载队列。
import type { DownloadTask, DuplicateResult, Settings } from '../types';
import type { WorkflowRun } from './downloadWorkflow';

interface DefaultFavoritesOptions {
  settings: Settings;
  workflow: WorkflowRun;
  appendLog: (text: string) => void;
  addToQueue: (tasks: DownloadTask[]) => void;
}

/** 在同一次占用内完成默认收藏夹查询、扫描、清理和入队。 */
export async function downloadDefaultFavorites(options: DefaultFavoritesOptions): Promise<void> {
  const { settings, workflow, appendLog, addToQueue } = options;
  appendLog('\n>>> 📂 正在获取默认收藏夹 ID...\n');
  const id = await window.api.getDefaultFavId();
  if (workflow.stopped) return;
  if (!id) {
    appendLog('>>> ⚠️ 无法获取默认收藏夹 ID，请确保已登录。\n');
    return;
  }
  const favId = String(id);
  appendLog(`\n>>> ⏰ 开始扫描默认收藏夹 (ID: ${favId}) ...\n`);
  const results = await window.api.checkDownloadHistory(favId);
  if (workflow.stopped) return;
  const missing = results.filter(r => !r.isDownloaded);

  if (results.length === 0) {
    appendLog(`>>> ⚠️ 收藏夹为空或解析失败，本次自动下载跳过。\n`);
    return;
  }

  appendLog(`>>> ✅ 扫描完成，发现 ${missing.length} 个未下载视频，正在加入下载队列...\n`);

  // 每次扫描都处理已下载条目，避免混有新视频时跳过上次移除失败的视频。
  const downloaded = results.filter(r => r.isDownloaded);
  if (settings.unfavAfterDownload && downloaded.length > 0) {
    await removeDownloadedFavorites(downloaded, favId, workflow, appendLog);
  }

  if (workflow.stopped) return;
  if (missing.length === 0) {
    appendLog(`>>> 🎉 默认收藏夹中所有视频均已下载，无需重复下载。\n`);
    return;
  }

  // 直接将未下载的 BV 号加入队列，携带 aid 和 mediaId 以便下载完成后取消收藏
  const tasks = missing.map(r => ({ url: r.bvid, isSilent: false, aid: r.aid, mediaId: Number(favId) }));
  addToQueue(tasks);
}

/** 清理本次扫描中已下载的条目，逐条报告取消收藏结果。 */
async function removeDownloadedFavorites(downloaded: DuplicateResult[], favId: string, workflow: WorkflowRun, appendLog: (text: string) => void): Promise<void> {
  appendLog(`>>> 🗑️ 已开启“下载完成后自动从收藏夹移除视频”，正在清理默认收藏夹中已下载的视频 (共 ${downloaded.length} 个视频)...\n`);
  let successCount = 0;
  for (let i = 0; i < downloaded.length; i++) {
    if (workflow.stopped) return;
    const item = downloaded[i];
    if (!item.aid) {
      appendLog(`>>> [${i + 1}/${downloaded.length}] ⚠️ 跳过取消收藏 ${item.bvid}，原因：未能获取到 AID\n`);
      continue;
    }
    try {
      const res = await window.api.removeFromFavFolder(item.aid, Number(favId));
      if (res.success) {
        successCount++;
        appendLog(`>>> [${i + 1}/${downloaded.length}] 🗑️ 已取消收藏: ${item.title || item.bvid}\n`);
      } else {
        appendLog(`>>> [${i + 1}/${downloaded.length}] ❌ 取消收藏失败: ${item.title || item.bvid} (${res.message || '未知错误'})\n`);
      }
    } catch (err: any) {
      appendLog(`>>> [${i + 1}/${downloaded.length}] ❌ 取消收藏出错: ${item.title || item.bvid} (${err.message})\n`);
    }
    // 延迟防风控
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  appendLog(`>>> 🏁 默认收藏夹清理完毕。成功取消收藏: ${successCount} 个，失败: ${downloaded.length - successCount} 个。\n`);
}

