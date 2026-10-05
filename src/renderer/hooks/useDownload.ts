// 渲染进程下载 Hook：管理下载任务队列、状态、日志及自动下载/取消收藏相关逻辑，与 Electron API 交互。
import { useState, useRef, useEffect, useCallback } from 'react';
import { DownloadTask, Settings, DuplicateResult } from '../types';
import { avToBv } from '../utils/bilibili';
import { DownloadWorkflow, WorkflowRun } from '../utils/downloadWorkflow';
import { downloadDefaultFavorites } from '../utils/defaultFavorites';

interface WorkflowTask extends DownloadTask { workflow: WorkflowRun; }

/** 管理下载队列，并统一处理手动和定时触发的默认收藏夹下载。 */
export function useDownload(settings: Settings) {
  const [logs, setLogs] = useState<string>('等待任务...');
  const [urlInput, setUrlInput] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [downloadQueue, setDownloadQueue] = useState<WorkflowTask[]>([]);
  const [activeTask, setActiveTask] = useState<WorkflowTask | null>(null);
  const [totalTasks, setTotalTasks] = useState(0);
  const [completedTasks, setCompletedTasks] = useState(0);
  const [subProgress, setSubProgress] = useState<{ current: number; total: number } | null>(null);
  
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);

  const [isDetecting, setIsDetecting] = useState(false);
  const [isMissingVideosModalOpen, setIsMissingVideosModalOpen] = useState(false);
  const [missingVideosResult, setMissingVideosResult] = useState<DuplicateResult[]>([]);
  const [isWorkflowBusy, setIsWorkflowBusy] = useState(false);
  const workflowRef = useRef<DownloadWorkflow | null>(null);
  if (!workflowRef.current) workflowRef.current = new DownloadWorkflow(setIsWorkflowBusy);
  const workflow = workflowRef.current;

  // 单视频重复确认弹窗：通过 Promise 暂停 checkAndAddTasks 等待用户选择
  const [redownloadConfirm, setRedownloadConfirm] = useState<{
    videoTitle: string;
    bvid: string;
  } | null>(null);
  const redownloadResolverRef = useRef<((value: boolean) => void) | null>(null);

  const logRef = useRef<HTMLDivElement>(null);
  const currentTaskRef = useRef<WorkflowTask | null>(null);
  const isPausedRef = useRef(false);

  /** 追加进度日志并控制界面日志长度。 */
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

  /** 同步取得整个流程的执行权，所有入口共用同一判断。 */
  const beginWorkflow = useCallback(() => {
    const run = workflow.begin();
    if (!run) appendLog('\n>>> ⏳ 当前流程尚未结束，已忽略新的触发。\n');
    return run;
  }, [workflow, appendLog]);

  const completedTasksRef = useRef(0);
  useEffect(() => {
    completedTasksRef.current = completedTasks;
  }, [completedTasks]);

  /** 将任务登记到当前流程并同步显示队列。 */
  const addToQueue = useCallback((tasks: DownloadTask[]) => {
    const owner = workflow.enqueue(tasks.length);
    if (!owner) return;
    setTotalTasks(prev => {
      if (prev === 0 || completedTasksRef.current >= prev) {
        setCompletedTasks(0);
        return tasks.length;
      }
      return prev + tasks.length;
    });

    setDownloadQueue(prev => [...prev, ...tasks.map(task => ({ ...task, workflow: owner }))]);
    appendLog(`\n>>> 📥 任务已入列（共 ${tasks.length} 个）...\n`);
  }, [appendLog, workflow]);

  /** 弹出自定义确认弹窗，返回用户选择（true=重新下载，false=跳过） */
  const showRedownloadConfirm = useCallback(
    (videoTitle: string, bvid: string): Promise<boolean> =>
      new Promise((resolve) => {
        redownloadResolverRef.current = resolve;
        setRedownloadConfirm({ videoTitle, bvid });
      }),
    []
  );

  /** 由 App.tsx 中的 ConfirmModal 按钮回调，解析 Promise 并关闭弹窗 */
  const handleRedownloadResponse = useCallback((result: boolean) => {
    setRedownloadConfirm(null);
    redownloadResolverRef.current?.(result);
    redownloadResolverRef.current = null;
  }, []);

  /** 取得流程执行权后预查重并建立下载队列。 */
  const checkAndAddTasks = useCallback(async (urls: string[], isSilent: boolean) => {
    if (urls.length === 0) return;
    const run = beginWorkflow();
    if (!run) return;
    const tasks = urls.map(url => ({ url, isSilent }));

    try {
      if (isSilent) {
        addToQueue(tasks);
        return;
      }
      setIsCheckingDuplicates(true);
      appendLog(`\n>>> 🔍 正在预解析视频列表并检查下载历史，请稍候...\n`);
      let allResults: DuplicateResult[] = [];
      for (const url of urls) {
        if (run.stopped) return;
        const results = await window.api.checkDownloadHistory(url);
        if (run.stopped) return;
        allResults = [...allResults, ...results];
      }

      const nonDuplicates = allResults.filter(r => !r.isDownloaded);
      const duplicates = allResults.filter(r => r.isDownloaded);

      if (allResults.length === 0) {
        // 无法解析视频列表，回退到原始 URL 直接下载
        addToQueue(tasks);
      } else if (nonDuplicates.length === 0) {
        if (allResults.length === 1) {
          // 单个视频已下载：用自定义弹窗询问用户
          const item = allResults[0];
          const redownload = await showRedownloadConfirm(item.title || item.bvid, item.bvid);
          if (redownload) {
            addToQueue(tasks);
          } else {
            appendLog(`\n>>> ⏭️ 已跳过：${item.bvid}\n`);
          }
        } else {
          // 批量（收藏夹）全部已下载：静默提示，不打扰
          appendLog(`\n>>> 🎉 所有 ${allResults.length} 个视频均已下载，无需重复下载。\n`);
        }
      } else {
        // 有新视频：自动跳过已下载的，只加入新视频
        if (duplicates.length > 0) {
          appendLog(`\n>>> ⏭️ 跳过 ${duplicates.length} 个已下载视频，正在下载 ${nonDuplicates.length} 个新视频...\n`);
        }
        addToQueue(nonDuplicates.map(r => ({ url: r.bvid, isSilent: false })));
      }
    } catch (e) {
      console.error(e);
      appendLog(`\n>>> ⚠️ 预检查失败，将直接尝试常规下载流程。\n`);
      addToQueue(tasks);
    } finally {
      setIsCheckingDuplicates(false);
      workflow.finishPreparation(run);
    }
  }, [addToQueue, appendLog, showRedownloadConfirm, beginWorkflow, workflow]);

  /** 解析输入并立即进入统一流程，解析期间不让出执行权。 */
  const handleDownload = async () => {
    if (workflow.busy) { beginWorkflow(); return; }
    const rawText = urlInput.trim();
    if (!rawText) return alert('请在上方输入框内粘贴链接');
    const urls = rawText.split(/[\s\n\r]+/).filter(u => u.length > 0);

    // 自动转换 AV 为 BV 号：虽然 BBDown 原生支持 AV 号下载，但在 UI 层统
    // 一转换为 BV 号，可以确保本地的“下载历史记录(download_history.txt)”中格式唯一，
    // 从而保证重复检查（去重提醒）功能准确无误。
    const processedUrls = urls.map((u) => {
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
    });

    setUrlInput('');
    await checkAndAddTasks(processedUrls, false);
  };

  /** 在独占流程内扫描收藏夹并展示结果。 */
  const handleDetectFavlist = async () => {
    const rawText = urlInput.trim();
    if (!rawText) return alert('请先在输入框粘贴 收藏夹链接 或 FID 数字');
    const run = beginWorkflow();
    if (!run) return;
    
    setIsDetecting(true);
    appendLog(`\n>>> 🔍 正在深度扫描收藏夹全量列表，请稍候...\n`);

    try {
      // main 进程已处理分页逻辑与 20 条阈值停止逻辑
      const results = await window.api.checkDownloadHistory(rawText);
      if (run.stopped) return;
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
      workflow.finishPreparation(run);
    }
  };

  /** 手动和定时触发共用默认收藏夹流程，不依赖输入框，不弹 alert。 */
  const triggerDefaultFavDownload = useCallback(async () => {
    const run = beginWorkflow();
    if (!run) return;
    setIsDetecting(true);
    try {
      // 设置保存可立即触发定时通知，取得执行权后读取主进程的已保存设置。
      const currentSettings = await window.api.getSettings();
      if (run.stopped) return;
      await downloadDefaultFavorites({ settings: currentSettings, workflow: run, appendLog, addToQueue });
    } catch (e: any) {
      appendLog(`>>> ❌ 自动任务执行失败: ${e.message}\n`);
    } finally {
      setIsDetecting(false);
      workflow.finishPreparation(run);
    }
  }, [addToQueue, appendLog, settings, beginWorkflow, workflow]);

  /** 手动入口与定时触发共享流程，查询默认收藏夹之前即取得执行权。 */
  const handleDownloadDefaultFav = useCallback(() => triggerDefaultFavDownload(), [triggerDefaultFavDownload]);

  /** 在独占流程内将检测结果转存到默认收藏夹。 */
  const handleCollectAll = async () => {
    const missing = missingVideosResult.filter(r => !r.isDownloaded);
    if (missing.length === 0) return;

    const run = beginWorkflow();
    if (!run) return;
    const confirm = window.confirm(`确定要将这 ${missing.length} 个视频全部转存到你的“默认收藏夹”吗？\n(转存成功后，你可以直接点击“下载默认收藏夹”进行稳定下载)`);
    if (!confirm) { workflow.finishPreparation(run); return; }

    setIsMissingVideosModalOpen(false);
    appendLog(`\n>>> 📁 正在尝试将 ${missing.length} 个视频转存至默认收藏夹...\n`);
    
    try {
      const folderId = await window.api.getDefaultFavId();
      if (run.stopped) return;
      if (!folderId) {
        throw new Error('未能获取到默认收藏夹 ID，请确认是否已登录');
      }

      let successCount = 0;
      for (let i = 0; i < missing.length; i++) {
        if (run.stopped) return;
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
    } finally {
      workflow.finishPreparation(run);
    }
  };

  /** 暂停当前任务并保留流程，等待子进程退出通知后才允许恢复。 */
  const handlePause = () => {
    if (!workflow.taskRunning || isPausedRef.current) return;
    isPausedRef.current = true;
    window.api.stopDownload();
    setIsPaused(true);
    appendLog(`\n>>> ⏸️ 下载已暂停。\n`);
  };

  /** 当前子进程退出后重新执行暂停的任务。 */
  const handleResume = () => {
    if (!isPausedRef.current) return;
    if (workflow.taskRunning) {
      appendLog('\n>>> ⏳ 正在等待当前任务结束，请稍后继续。\n');
      return;
    }
    isPausedRef.current = false;
    setIsPaused(false);
    appendLog(`\n>>> ▶️ 下载已恢复。\n`);
  };

  /** 停止整个流程，等待在途请求和下载结束后才允许新流程。 */
  const handleStop = () => {
    if (!workflow.busy) return;
    if (workflow.taskRunning) window.api.stopDownload();
    workflow.stop();
    redownloadResolverRef.current?.(false);
    redownloadResolverRef.current = null;
    setRedownloadConfirm(null);
    isPausedRef.current = false;
    setDownloadQueue([]);
    setActiveTask(null);
    setIsPaused(false);
    if (!workflow.taskRunning) setIsDownloading(false);
    setTotalTasks(0);
    setCompletedTasks(0);
    setSubProgress(null);
    appendLog(workflow.busy
      ? '\n>>> ⏹️ 已停止后续任务，正在等待当前操作结束。\n'
      : '\n>>> ⏹️ 下载已停止并清空队列。\n');
  };

  /** 清空显示日志，保留当前流程和任务状态。 */
  const clearLogs = useCallback(() => {
    setLogs('等待任务...');
  }, []);

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
    api.onComplete((code: number | null) => {
      appendLog(`\n====== 任务结束 (Code: ${code}) ======\n`);
      currentTaskRef.current = null;
      setIsDownloading(false);
      if (workflow.completeTask(isPausedRef.current && code !== 0)) {
        setCompletedTasks(prev => prev + 1);
        setActiveTask(null);
      }
      if (!workflow.busy) {
        isPausedRef.current = false;
        setIsPaused(false);
      }
    });
    api.onClipboardMatch((url: string) => {
      setUrlInput(url);
      appendLog(`\n>>> 🔗 捕获到普通链接，已自动填入！\n`);
    });
    api.onSilentClipboardMatch(async (url: string) => {
      appendLog(`\n>>> 🤫 捕获到外部静默下载指令: ${url}\n`);
      await checkAndAddTasks([url], true);
    });
  }, [appendLog, checkAndAddTasks, workflow]);

  // 注册定时任务触发事件
  useEffect(() => {
    window.api.onScheduledFavDownload(async (message) => {
      if (message) {
        // 主进程传来的提示（如未登录）
        appendLog(`\n>>> ${message}\n`);
        return;
      }
      await triggerDefaultFavDownload();
    });
  }, [appendLog, triggerDefaultFavDownload]);

  useEffect(() => {
    if (!isDownloading && !isPaused && (activeTask || downloadQueue.length > 0)) {
      const taskToStart = activeTask || downloadQueue[0];
      if (!taskToStart || !workflow.startTask(taskToStart.workflow)) return;

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
        taskToStart.isSilent,
        taskToStart.aid,
        taskToStart.mediaId
      );
    } else if (!isDownloading && !isPaused && totalTasks > 0 && completedTasks >= totalTasks && activeTask === null) {
      if (logs !== '等待任务...' && (logs.includes('🚀 开始处理') || logs.includes('🚀 开始下载'))) {
        window.api.notifyQueueDone();
        appendLog('\n>>> 🟢 所有队列任务已执行完毕，等待新任务...\n');
        setTotalTasks(0);
        setCompletedTasks(0);
      }
    }
  }, [isDownloading, isPaused, downloadQueue.length, activeTask, settings, totalTasks, completedTasks, logs, appendLog, workflow]);

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
    isWorkflowBusy,
    redownloadConfirm,
    handleRedownloadResponse,
    handleDownload,
    handlePause,
    handleResume,
    handleStop,
    clearLogs,
    checkAndAddTasks,
    handleDownloadDefaultFav,
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
