// 下载界面适配层：仅保存输入框、弹窗和展示状态；所有执行权与队列归 Electron 主进程。
// 关联：downloadRuntime.ts 提供统一下载服务；App.tsx 使用 Hook 渲染视图。
import { useState, useEffect, useCallback, useRef } from 'react';
import type { Settings } from '../types';
import type { DownloadState, DuplicateResult } from '../../shared/download';
import { avToBv } from '../utils/bilibili';

const INITIAL: DownloadState = {
  busy: false, downloading: false, paused: false,
  checking: false, detecting: false, total: 0, completed: 0
};

/** 渲染器只负责显示主进程的权威状态与发送用户命令。 */
export function useDownload(_settings: Settings) {
  const [status, setStatus] = useState<DownloadState>(INITIAL);
  const [logs, setLogs] = useState('等待任务...');
  const [urlInput, setUrlInput] = useState('');
  const [subProgress, setSubProgress] = useState<{current:number;total:number}|null>(null);
  const [redownloadConfirm, setRedownloadConfirm] = useState<{videoTitle:string;bvid:string}|null>(null);
  const [missingVideosResult, setMissingVideosResult] = useState<DuplicateResult[]>([]);
  const [isMissingVideosModalOpen, setIsMissingVideosModalOpen] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  /** 显示可控大小的实时日志，刷新界面仍可从主进程恢复。 */
  const appendLog = useCallback((message: string) => {
    setLogs(previous => {
      let next = previous;
      if (message.includes('\r')) {
        const lines = previous.split('\n');
        const clean = message.replace(/\r/g, '').trim();
        if (clean) lines[lines.length - 1] = clean;
        next = lines.join('\n');
      } else {
        next += message;
      }
      return next.length > 15000 ? next.slice(-10000) : next;
    });
  }, []);

  /** 仅解析 BBDown 进度展示；完整任务状态不由前端推断。 */
  const parseProgress = useCallback((message: string) => {
    const parts = message.split(/[\r\n]+/);
    for (const line of parts) {
      const bracket = line.match(/[\[\(\s](\d+)\s*[\/\-之]\s*(\d+)[\]\)\s]/);
      if (bracket) {
        const current = Number(bracket[1]), total = Number(bracket[2]);
        if (total > 1 && total < 5000 && current <= total && ![1080,720,480,2160].includes(total)) {
          setSubProgress({current,total});
          continue;
        }
      }
      const total = line.match(/共计\s*(\d+)\s*个/);
      if (total) setSubProgress(old => ({current:old?.current ?? 0,total:Number(total[1])}));
      const part = line.match(/开始下载P(\d+)/i) || line.match(/下载P(\d+)完毕/i);
      if (part) setSubProgress(old => ({current:Number(part[1]),total:old?.total ?? 0}));
    }
  }, []);

  /** 先订阅事件，再读取权威快照，避免漏掉启动期状态。 */
  useEffect(() => {
    let mounted = true;
    let receivedState = false;
    let receivedLog = false;
    window.api.onManagerState(value => {
      if (mounted) { receivedState = true; setStatus(value); }
    });
    window.api.onManagerLog(message => {
      if (!mounted) return;
      receivedLog = true;
      appendLog(message);
      parseProgress(message);
    });
    window.api.onManagerConfirm(value => {
      if (mounted) setRedownloadConfirm(value ? {videoTitle:value.title,bvid:value.bvid} : null);
    });
    window.api.onClipboardMatch(value => {
      if (mounted) {
        setUrlInput(value);
        appendLog('\n>>> 🔗 捕获到普通链接，已自动填入！\n');
      }
    });
    void window.api.getManagerSnapshot().then(snapshot => {
      if (!mounted) return;
      if (!receivedState) setStatus(snapshot.state);
      if (!receivedLog) setLogs(snapshot.logs);
      if (snapshot.confirmation) setRedownloadConfirm({videoTitle:snapshot.confirmation.title,bvid:snapshot.confirmation.bvid});
    }).catch(error => appendLog(`>>> ❌ 无法恢复后台状态：${String(error)}\n`));
    return () => { mounted = false; };
  }, [appendLog, parseProgress]);

  /** 手动输入统一转为 BV 号，然后交给主进程处理查重及下载。 */
  const handleDownload = async () => {
    if (status.busy) return;
    const raw = urlInput.trim();
    if (!raw) return alert('请在上方输入框内粘贴链接');
    try {
      const urls = raw.split(/[\s\n\r]+/).filter(Boolean).map(url => {
        if (!/^(av)?\d+$/i.test(url)) return url;
        try { return avToBv(url.toLowerCase().replace('av','')); }
        catch (error) {
          appendLog(`>>> ⚠️ AV 号转换失败，沿用原始输入：${String(error)}\n`);
          return url;
        }
      });
      const started = await window.api.managerStart(urls,false);
      if (started) setUrlInput('');
    } catch (error) {
      appendLog(`>>> ❌ 下载请求失败：${String(error)}\n`);
    }
  };

  /** 普通入口与剪贴板均走主进程相同的执行权。 */
  const checkAndAddTasks = async (urls: string[], silent: boolean) => {
    await window.api.managerStart(urls,silent);
  };

  /** 用户主动发起默认收藏夹扫描。 */
  const handleDownloadDefaultFav = async () => {
    await window.api.managerDefault();
  };

  /** 检测收藏夹并显示尚未下载的视频。 */
  const handleDetectFavlist = async () => {
    const raw = urlInput.trim();
    if (!raw) return alert('请先在输入框粘贴 收藏夹链接 或 FID 数字');
    try {
      const result = await window.api.managerDetect(raw);
      if (result) {
        setMissingVideosResult(result);
        setIsMissingVideosModalOpen(result.length > 0);
        setUrlInput('');
      }
    } catch (error) { appendLog(`>>> ❌ 检测失败：${String(error)}\n`); }
  };

  /** 将已检测视频转存至默认收藏夹。 */
  const handleCollectAll = async () => {
    const missing = missingVideosResult.filter(item => !item.isDownloaded);
    if (!missing.length) return;
    if (!window.confirm(`确定将这 ${missing.length} 个视频转存到默认收藏夹？`)) return;
    const started = await window.api.managerCollect(missing);
    if (started) setIsMissingVideosModalOpen(false);
  };

  /** 重复下载确认由主进程等待，UI 仅回传确认结果。 */
  const handleRedownloadResponse = (answer: boolean) => {
    setRedownloadConfirm(null);
    window.api.managerConfirm(answer);
  };

  /** 发送控制命令，不在前端复制或变更队列。 */
  const handlePause = () => window.api.managerPause();
  const handleResume = () => window.api.managerResume();
  const handleStop = () => {
    window.api.managerStop();
    setRedownloadConfirm(null);
    setIsMissingVideosModalOpen(false);
  };
  const clearLogs = () => setLogs('等待任务...');

  return {
    logs,urlInput,setUrlInput,
    isDownloading:status.downloading,isPaused:status.paused,
    totalTasks:status.total,completedTasks:status.completed,
    subProgress,isCheckingDuplicates:status.checking,
    isWorkflowBusy:status.busy,
    redownloadConfirm,handleRedownloadResponse,handleDownload,
    handlePause,handleResume,handleStop,clearLogs,
    checkAndAddTasks,handleDownloadDefaultFav,handleDetectFavlist,handleCollectAll,
    isDetecting:status.detecting,isMissingVideosModalOpen,setIsMissingVideosModalOpen,
    missingVideosResult,logRef,appendLog
  };
}
