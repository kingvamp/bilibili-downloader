// 下载界面适配层：仅保存输入框、弹窗和展示状态；所有执行权与队列归 Electron 主进程。
// 关联：downloadRuntime.ts 提供统一下载服务；App.tsx 使用 Hook 渲染视图。
import { useState, useEffect, useCallback } from 'react';
import type { DownloadState, DuplicateResult } from '../../shared/download';
import { avToBv } from '../utils/bilibili';

const INITIAL: DownloadState = {
  busy: false, downloading: false, paused: false,
  checking: false, detecting: false, total: 0, completed: 0, subProgress: null
};

/** 渲染器只负责显示主进程的权威状态与发送用户命令。 */
export function useDownload() {
  const [status, setStatus] = useState<DownloadState>(INITIAL);
  const [logs, setLogs] = useState('等待任务...');
  const [urlInput, setUrlInput] = useState('');
  const [redownloadConfirm, setRedownloadConfirm] = useState<{videoTitle:string;bvid:string}|null>(null);
  const [missingVideosResult, setMissingVideosResult] = useState<DuplicateResult[]>([]);
  const [isMissingVideosModalOpen, setIsMissingVideosModalOpen] = useState(false);

  /** 界面产生的提示交给主进程维护，与后台日志共用快照和清空操作。 */
  const appendLog = useCallback((message: string) => {
    window.api.managerAppendLog(message);
  }, []);

  /** 先订阅事件，再读取权威快照，避免漏掉启动期状态。 */
  useEffect(() => {
    let mounted = true;
    let receivedState = false;
    let receivedLog = false;
    window.api.onManagerState(value => {
      if (mounted) { receivedState = true; setStatus(value); }
    });
    window.api.onManagerLog(logs => {
      if (!mounted) return;
      receivedLog = true;
      setLogs(logs);
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
  }, [appendLog]);

  /** 手动输入统一转为 BV 号，然后交给主进程处理查重及下载。 */
  const handleDownload = async () => {
    if (status.busy) return;
    const raw = urlInput.trim();
    if (!raw) return alert('请在上方输入框内粘贴链接');
    try {
      const urls = raw.split(/[\s\n\r]+/).filter(Boolean).map(url => {
        if (!/^(av)?\d+$/i.test(url)) return url;
        return avToBv(url.toLowerCase().replace('av',''));
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
  const clearLogs = () => window.api.managerClearLogs();

  return {
    logs,urlInput,setUrlInput,
    isDownloading:status.downloading,isPaused:status.paused,
    totalTasks:status.total,completedTasks:status.completed,
    subProgress:status.subProgress,isCheckingDuplicates:status.checking,
    isWorkflowBusy:status.busy,
    redownloadConfirm,handleRedownloadResponse,handleDownload,
    handlePause,handleResume,handleStop,clearLogs,
    checkAndAddTasks,handleDownloadDefaultFav,handleDetectFavlist,handleCollectAll,
    isDetecting:status.detecting,isMissingVideosModalOpen,setIsMissingVideosModalOpen,
    missingVideosResult,appendLog
  };
}
