import { useState, useRef, useEffect, useCallback } from 'react';
import { DownloadTask, Settings, DuplicateResult } from '../types';
import { avToBv } from '../utils/bilibili';

export function useDownload(settings: Settings) {
  const [logs, setLogs] = useState<string>('等待任务...');
  const [urlInput, setUrlInput] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [downloadQueue, setDownloadQueue] = useState<DownloadTask[]>([]);
  const [activeTask, setActiveTask] = useState<DownloadTask | null>(null);
  const [totalTasks, setTotalTasks] = useState(0);
  const [completedTasks, setCompletedTasks] = useState(0);
  const [subProgress, setSubProgress] = useState<{ current: number; total: number } | null>(null);
  
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);
  const [duplicateResults, setDuplicateResults] = useState<DuplicateResult[]>([]);
  const [pendingTasks, setPendingTasks] = useState<DownloadTask[]>([]);

  const [isDetecting, setIsDetecting] = useState(false);
  const [isMissingVideosModalOpen, setIsMissingVideosModalOpen] = useState(false);
  const [missingVideosResult, setMissingVideosResult] = useState<DuplicateResult[]>([]);

  const logRef = useRef<HTMLDivElement>(null);
  const currentTaskRef = useRef<DownloadTask | null>(null);
  const isPausedRef = useRef(false);

  const appendLog = useCallback((data: string) => {
    setLogs(prev => {
      let newLogs = prev;
      if (data.includes('\r')) {
        const lines = prev.split('\n');
        const cleanData = data.replace(/\r/g, '').trim();
        if (cleanData) {
          lines[lines.length - 1] = cleanData;
          newLogs = lines.join('\n');
        }
      } else {
        newLogs = prev + data;
      }

      if (newLogs.length > 15000) {
        newLogs = newLogs.substring(newLogs.length - 10000);
      }
      return newLogs;
    });
  }, []);

  const completedTasksRef = useRef(0);
  useEffect(() => {
    completedTasksRef.current = completedTasks;
  }, [completedTasks]);

  const addToQueue = useCallback((tasks: DownloadTask[]) => {
    setTotalTasks(prev => {
      if (prev === 0 || completedTasksRef.current >= prev) {
        setCompletedTasks(0);
        return tasks.length;
      }
      return prev + tasks.length;
    });

    setDownloadQueue(prev => [...prev, ...tasks]);
    appendLog(`\n>>> 📥 任务已入列（共 ${tasks.length} 个）...\n`);
  }, [appendLog]);

  const checkAndAddTasks = useCallback(async (urls: string[], isSilent: boolean) => {
    if (urls.length === 0) return;
    const tasks = urls.map(url => ({ url, isSilent }));

    if (isSilent) {
      addToQueue(tasks);
      return;
    }

    setIsCheckingDuplicates(true);
    appendLog(`\n>>> 🔍 正在预解析视频列表并检查下载历史，请稍候...\n`);

    try {
      let allResults: DuplicateResult[] = [];
      for (const url of urls) {
        const results = await window.api.checkDownloadHistory(url);
        allResults = [...allResults, ...results];
      }

      const duplicates = allResults.filter(r => r.isDownloaded);
      if (duplicates.length > 0) {
        setDuplicateResults(allResults);
        setPendingTasks(tasks);
        setIsDuplicateModalOpen(true);
      } else {
        addToQueue(tasks);
      }
    } catch (e) {
      console.error(e);
      appendLog(`\n>>> ⚠️ 预检查失败，将直接尝试常规下载流程。\n`);
      addToQueue(tasks);
    } finally {
      setIsCheckingDuplicates(false);
    }
  }, [addToQueue, appendLog]);

  const handleDownload = async () => {
    const rawText = urlInput.trim();
    if (!rawText) return alert('请在上方输入框内粘贴链接');
    const urls = rawText.split(/[\s\n\r]+/).filter(u => u.length > 0);

    // 自动转换 AV 为 BV 号：虽然 BBDown 原生支持 AV 号下载，但在 UI 层统
    // 一转换为 BV 号，可以确保本地的“下载历史记录(download_history.txt)”中格式唯一，
    // 从而保证重复检查（去重提醒）功能准确无误。
    const processedUrls = await Promise.all(urls.map(async (u) => {
      // 匹配 av123 或单纯数字 123
      if (/^(av)?\d+$/i.test(u)) {
        try {
          const aid = u.toLowerCase().replace('av', '');
          const bvid = avToBv(aid);
          appendLog(`\n>>> 🔄 已自动将 AV${aid} 转换为 ${bvid} (用于统一历史记录)\n`);
          return bvid;
        } catch (e) {
          return u;
        }
      }
      return u;
    }));

    setUrlInput('');
    await checkAndAddTasks(processedUrls, false);
  };

  const handleDetectFavlist = async () => {
    const rawText = urlInput.trim();
    if (!rawText) return alert('请先在输入框粘贴 收藏夹链接 或 FID 数字');
    
    setIsDetecting(true);
    appendLog(`\n>>> 🔍 正在深度扫描收藏夹全量列表，请稍候...\n`);

    try {
      // main 进程已处理分页逻辑与 20 条阈值停止逻辑
      const results = await window.api.checkDownloadHistory(rawText);
      const isMissing = results.filter(r => !r.isDownloaded);
      
      if (results.length === 0) {
        appendLog(`>>> ⚠️ 未能从该地址中解析出有效的视频列表，请检查输入。\n`);
      } else {
        setMissingVideosResult(results);
        setIsMissingVideosModalOpen(true);
        appendLog(`>>> ✅ 扫描完成，发现 ${isMissing.length} 个未下载视频。\n`);
      }
    } catch (e: any) {
      alert('检测失败: ' + e.message);
    } finally {
      setIsDetecting(false);
      setUrlInput('');
    }
  };

  const handleCollectAll = async () => {
    const missing = missingVideosResult.filter(r => !r.isDownloaded);
    if (missing.length === 0) return;

    const confirm = window.confirm(`确定要将这 ${missing.length} 个视频全部转存到你的“默认收藏夹”吗？\n(转存成功后，你可以直接点击“下载默认收藏夹”进行稳定下载)`);
    if (!confirm) return;

    setIsMissingVideosModalOpen(false);
    appendLog(`\n>>> 📁 正在尝试将 ${missing.length} 个视频转存至默认收藏夹...\n`);
    
    try {
      const folderId = await window.api.getDefaultFavId();
      if (!folderId) {
        throw new Error('未能获取到默认收藏夹 ID，请确认是否已登录');
      }

      let successCount = 0;
      for (let i = 0; i < missing.length; i++) {
        const item = missing[i];
        if (!item.aid) {
          appendLog(`>>> ⚠️ 跳过 ${item.bvid}: 未能获取到 AID\n`);
          continue;
        }
        
        const res = await window.api.collectToFavFolder(item.aid, folderId);
        if (res.success) {
          successCount++;
          appendLog(`>>> [${i + 1}/${missing.length}] ✅ 已转存: ${item.title}\n`);
        } else {
          appendLog(`>>> [${i + 1}/${missing.length}] ❌ 失败: ${item.title} (${res.message})\n`);
        }
        // 稍微延迟一下防止触发频率限制
        await new Promise(r => setTimeout(r, 300));
      }

      appendLog(`>>> 🏁 转存处理完毕。成功: ${successCount}，失败: ${missing.length - successCount}\n`);
      if (successCount > 0) {
        appendLog(`>>> ✨ 现在你可以点击“下载默认收藏夹”来稳定下载这些视频了！\n`);
      }
    } catch (e: any) {
      appendLog(`>>> ❌ 转存操作发生错误: ${e.message}\n`);
      alert('转存失败: ' + e.message);
    }
  };

  const handlePause = () => {
    isPausedRef.current = true;
    window.api.stopDownload();
    setIsPaused(true);
    setIsDownloading(false);
    appendLog(`\n>>> ⏸️ 下载已暂停。\n`);
  };

  const handleResume = () => {
    isPausedRef.current = false;
    setIsPaused(false);
    appendLog(`\n>>> ▶️ 下载已恢复。\n`);
  };

  const handleStop = () => {
    window.api.stopDownload();
    isPausedRef.current = false;
    setDownloadQueue([]);
    setActiveTask(null);
    setIsPaused(false);
    setIsDownloading(false);
    setTotalTasks(0);
    setCompletedTasks(0);
    setSubProgress(null);
    appendLog(`\n>>> ⏹️ 下载已停止并清空队列。\n`);
  };

  useEffect(() => {
    const api = window.api;
    api.onProgress((data: string) => {
      appendLog(data);
      const lines = data.split(/[\r\n]+/);
      for (const line of lines) {
        const matchBracket = line.match(/[\[\(\s](\d+)\s*[\/\-之\/]\s*(\d+)[\]\)\s]/);
        if (matchBracket) {
          const current = parseInt(matchBracket[1]);
          const total = parseInt(matchBracket[2]);
          if (total > 1 && current <= total && total < 5000) {
            if (!(total === 1080 || total === 720 || total === 480 || total === 2160)) {
               setSubProgress({ current, total });
               continue;
            }
          }
        }
        const totalMatch = line.match(/共计\s*(\d+)\s*个/);
        if (totalMatch) {
          setSubProgress(prev => ({ 
            current: prev ? prev.current : 0, 
            total: parseInt(totalMatch[1]) 
          }));
        }
        const partMatch = line.match(/开始下载P(\d+)/i) || 
                          line.match(/下载P(\d+)完毕/i);
        if (partMatch) {
          setSubProgress(prev => ({ 
            current: parseInt(partMatch[1]), 
            total: prev ? prev.total : 0 
          }));
        }
      }
    });
    api.onComplete((code: number) => {
      appendLog(`\n====== 任务结束 (Code: ${code}) ======\n`);
      setIsDownloading(false);
      if (!isPausedRef.current) {
        setCompletedTasks(prev => prev + 1);
        setActiveTask(null);
      }
    });
    api.onClipboardMatch((url: string) => {
      setUrlInput(url);
      appendLog(`\n>>> 🔗 捕获到普通链接，已自动填入！\n`);
    });
    api.onSilentClipboardMatch(async (url: string) => {
      appendLog(`\n>>> 🤫 捕获到外部静默下载指令，已加入队列: ${url}\n`);
      await checkAndAddTasks([url], true);
    });
  }, [appendLog, checkAndAddTasks]);

  useEffect(() => {
    if (!isDownloading && !isPaused && (activeTask || downloadQueue.length > 0)) {
      const taskToStart = activeTask || downloadQueue[0];
      if (!taskToStart) return;

      if (!activeTask) {
        setActiveTask(taskToStart);
        setDownloadQueue(prev => prev.slice(1));
      }

      setIsDownloading(true);
      setSubProgress(null);
      currentTaskRef.current = taskToStart;

      let inputUrl = taskToStart.url;
      let isBatch = false;
      if (/^\d+$/.test(inputUrl) || inputUrl.includes('list/ml') || inputUrl.includes('favlist')) {
        isBatch = true;
      }

      appendLog(`\n>>> 🚀 开始下载: ${inputUrl}\n`);
      window.api.startDownload(
        inputUrl,
        isBatch,
        settings.dlSub,
        settings.downloadDir,
        taskToStart.isSilent,
        settings.multiThread
      );
    } else if (!isDownloading && !isPaused && totalTasks > 0 && completedTasks >= totalTasks && activeTask === null) {
      if (logs !== '等待任务...' && (logs.includes('🚀 开始处理') || logs.includes('🚀 开始下载'))) {
        window.api.notifyQueueDone();
        appendLog('\n>>> 🟢 所有队列任务已执行完毕，等待新任务...\n');
        setTotalTasks(0);
        setCompletedTasks(0);
      }
    }
  }, [isDownloading, isPaused, downloadQueue.length, activeTask, settings, totalTasks, completedTasks, logs, appendLog]);

  return {
    logs,
    urlInput,
    setUrlInput,
    isDownloading,
    isPaused,
    totalTasks,
    completedTasks,
    subProgress,
    isCheckingDuplicates,
    isDuplicateModalOpen,
    setIsDuplicateModalOpen,
    duplicateResults,
    pendingTasks,
    addToQueue,
    handleDownload,
    handlePause,
    handleResume,
    handleStop,
    checkAndAddTasks,
    handleDetectFavlist,
    handleCollectAll,
    isDetecting,
    isMissingVideosModalOpen,
    setIsMissingVideosModalOpen,
    missingVideosResult,
    logRef,
    appendLog,
  };
}
