import { useState, useEffect, useRef, useCallback } from 'react';

// --- Types ---
interface UserInfo {
  isLogin: boolean;
  uname?: string;
  face?: string;
  mid?: number;
}

interface Settings {
  downloadDir: string;
  clipboardMonitor: boolean;
  dlSub: boolean;
  multiThread: boolean;
  closeToTray: boolean;
  notifyState: boolean;
  soundState: boolean;
}

interface DownloadTask {
  url: string;
  isSilent: boolean;
}

// --- App Component ---
function App() {
  // State
  const [userInfo, setUserInfo] = useState<UserInfo>({ isLogin: false });
  const [settings, setSettings] = useState<Settings>({
    downloadDir: localStorage.getItem('downloadDir') || './downloads',
    clipboardMonitor: localStorage.getItem('clipboardMonitor') === 'true',
    dlSub: localStorage.getItem('dlSub') === 'true',
    multiThread: localStorage.getItem('multiThread') === 'true',
    closeToTray: localStorage.getItem('closeToTray') !== 'false',
    notifyState: localStorage.getItem('notifyState') !== 'false',
    soundState: localStorage.getItem('soundState') === 'true',
  });
  const [logs, setLogs] = useState<string>('等待任务...');
  const [qrCode, setQrCode] = useState<{ imgData: string; key: string } | null>(null);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadQueue, setDownloadQueue] = useState<DownloadTask[]>([]);

  // Refs
  const logRef = useRef<HTMLDivElement>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentTaskRef = useRef<DownloadTask | null>(null);

  // --- Actions ---

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

      // Truncate logs if too long (consistent with original logic)
      if (newLogs.length > 15000) {
        newLogs = newLogs.substring(newLogs.length - 10000);
      }
      return newLogs;
    });
  }, []);

  const processQueue = useCallback(() => {
    setDownloadQueue(prevQueue => {
      if (prevQueue.length === 0) {
        if (isDownloading) {
        window.api.notifyQueueDone();
        }
        setIsDownloading(false);
        appendLog('\n>>> 🟢 所有队列任务已执行完毕，等待新任务...\n');
        return [];
      }

      setIsDownloading(true);
      const nextTask = prevQueue[0];
      const remainingQueue = prevQueue.slice(1);
      currentTaskRef.current = nextTask;

      let inputUrl = nextTask.url;
      let isBatch = false;

      // Smart recognition logic from renderer.ts
      if (/^\d+$/.test(inputUrl)) {
        inputUrl = `https://www.bilibili.com/list/ml${inputUrl}`;
        isBatch = true;
        if (!nextTask.isSilent) appendLog(`\n>>> 🤖 智能识别：纯数字 ID，转换为播单链接...\n`);
      } else if (
        inputUrl.includes('list/ml') ||
        inputUrl.includes('medialist') ||
        inputUrl.includes('favlist') ||
        inputUrl.includes('fid=') ||
        inputUrl.includes('collection') ||
        inputUrl.includes('/series/') ||
        inputUrl.includes('sid=')
      ) {
        isBatch = true;
        if (!nextTask.isSilent) appendLog(`\n>>> 🤖 智能识别：检测到列表特征...\n`);
      }

      appendLog(`\n>>> 🚀 开始处理队列任务: ${inputUrl}\n`);

      window.api.startDownload(
        inputUrl,
        isBatch,
        settings.dlSub,
        settings.downloadDir,
        nextTask.isSilent,
        settings.multiThread
      );

      return remainingQueue;
    });
  }, [isDownloading, settings, appendLog]);

  const checkUserStatus = async () => {
    const info = await window.api.getUserInfo();
    setUserInfo(info);
    if (info.isLogin && info.uname) {
      appendLog(`>>> 欢迎回来, ${info.uname} (高画质已激活)\n`);
    }
  };

  const startLogin = async () => {
    setIsLoginModalOpen(true);
    const res = await window.api.getQRCode();
    if (res.success && res.imgData && res.key) {
      setQrCode({ imgData: res.imgData, key: res.key });
      startPolling(res.key);
    }
  };

  const startPolling = (key: string) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = setInterval(async () => {
      const check = await window.api.checkLogin(key);
      if (check.status === 'success') {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        setIsLoginModalOpen(false);
        checkUserStatus();
        alert('登录成功！');
      }
    }, 3000);
  };

  const handleDownload = () => {
    const rawText = urlInput.trim();
    if (!rawText) return alert('请在上方输入框内粘贴链接');
    const urls = rawText.split(/[\s\n\r]+/).filter(u => u.length > 0);
    const tasks = urls.map(url => ({ url, isSilent: false }));
    setDownloadQueue(prev => [...prev, ...tasks]);
    appendLog(`\n>>> 📥 成功切分！已将 ${urls.length} 个任务加入下载队列...\n`);
    setUrlInput('');
  };

  const saveSettings = (newSettings: Settings) => {
    setSettings(newSettings);
    // Explicitly update main process states if they changed
    if (settings.clipboardMonitor !== newSettings.clipboardMonitor) {
      window.api.setClipboardMonitor(newSettings.clipboardMonitor);
      appendLog(newSettings.clipboardMonitor ? `\n>>> 📋 剪贴板监听已开启。\n` : `\n>>> ⏸️ 剪贴板监听已关闭。\n`);
    }
    if (settings.closeToTray !== newSettings.closeToTray) window.api.setCloseToTray(newSettings.closeToTray);
    if (settings.notifyState !== newSettings.notifyState) window.api.setNotifyState(newSettings.notifyState);
    if (settings.soundState !== newSettings.soundState) window.api.setSoundState(newSettings.soundState);

    // Save to localStorage
    Object.entries(newSettings).forEach(([key, value]) => {
      localStorage.setItem(key, String(value));
    });
    setIsSettingsModalOpen(false);
  };

  // --- Effects ---

  // Initialize
  useEffect(() => {
    checkUserStatus();
    window.api.setCloseToTray(settings.closeToTray);
    window.api.setNotifyState(settings.notifyState);
    window.api.setSoundState(settings.soundState);
    if (settings.clipboardMonitor) {
      window.api.setClipboardMonitor(true);
      appendLog('>>> 📋 剪贴板监听已按偏好设置自动开启\n');
    }

    // Cleanup polling on unmount
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  // Listeners
  useEffect(() => {
    const api = window.api;
    api.onProgress((data: string) => appendLog(data));
    api.onComplete((code: number) => {
      appendLog(`\n====== 当前任务结束 (Code: ${code}) ======\n`);
      processQueue();
    });
    api.onClipboardMatch((url: string) => {
      setUrlInput(url);
      appendLog(`\n>>> 🔗 捕获到普通链接，已自动填入！\n`);
    });
    api.onSilentClipboardMatch((url: string) => {
      appendLog(`\n>>> 🤫 捕获到外部静默下载指令，已加入队列: ${url}\n`);
      setDownloadQueue(prev => [...prev, { url, isSilent: true }]);
    });
    api.onOpenSettings(() => setIsSettingsModalOpen(true));
  }, [appendLog, processQueue]);

  // Trigger download when queue changes and not downloading
  useEffect(() => {
    if (!isDownloading && downloadQueue.length > 0) {
      processQueue();
    }
  }, [downloadQueue, isDownloading, processQueue]);

  // Handle Scroll
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  // --- Render ---
  return (
    <>
      <header>
        <div className="app-title">📺 Bilibili Downloader</div>
        <div className="header-right">
          <div className="user-area">
            {!userInfo.isLogin ? (
              <button className="login-btn" onClick={startLogin}>
                扫码登录
              </button>
            ) : (
              <div className="user-profile">
                <img src={userInfo.face} alt="" />
                <span>{userInfo.uname}</span>
              </div>
            )}
          </div>
          <button className="settings-btn" onClick={() => setIsSettingsModalOpen(true)} title="打开设置">
            <svg viewBox="0 0 24 24">
              <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.06-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.73,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.06,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.43-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.49-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" />
            </svg>
          </button>
          <div className="window-controls">
            <button className="win-btn" onClick={() => (window as any).api.minWindow()} title="隐藏窗口">
              <svg viewBox="0 0 10 1"><path d="M0 0h10v1H0z" /></svg>
            </button>
            <button className="win-btn" onClick={() => (window as any).api.maxWindow()} title="最大化">
              <svg viewBox="0 0 10 10"><path d="M0 0h10v10H0V0zm1 1v8h8V1H1z" /></svg>
            </button>
            <button className="win-btn close-btn" onClick={() => (window as any).api.closeWindow()} title="关闭">
              <svg viewBox="0 0 10 10"><path d="M10 1L9 0 5 4 1 0 0 1l4 4-4 4 1 1 4-4 4 4 1-1-4-4z" /></svg>
            </button>
          </div>
        </div>
      </header>

      <main>
        <div className="input-group">
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="粘贴视频链接、收藏夹链接 或 播单数字ID (支持多行批量)"
          />
          <button className="download-btn" onClick={handleDownload} disabled={isDownloading && downloadQueue.length === 0}>
            解析并下载
          </button>
        </div>

        <div className="shortcut-group">
          <button
            className="shortcut-btn"
            onClick={() => {
              if (!userInfo.mid) return alert('请先扫码登录后再使用此功能');
              window.api.openExternal(`https://space.bilibili.com/${userInfo.mid}/favlist`);
            }}
          >
            <svg viewBox="0 0 24 24"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/></svg>
            打开默认收藏夹
          </button>
          <button
            className="shortcut-btn"
            onClick={() => {
              if (!userInfo.mid) return alert('请先扫码登录后再使用此功能');
              const url = `https://space.bilibili.com/${userInfo.mid}/favlist`;
              setDownloadQueue(prev => [...prev, { url, isSilent: false }]);
              appendLog(`\n>>> 📂 已将个人收藏夹页加入下载队列...\n`);
            }}
          >
            <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
            下载默认收藏夹
          </button>
        </div>

        <div id="log" ref={logRef}>
          {logs}
        </div>
      </main>

      {/* Login Modal */}
      {isLoginModalOpen && (
        <div className="modal-overlay active">
          <div className="modal-content">
            <h3 style={{ marginTop: 0 }}>📱 扫码登录</h3>
            <img id="qr-img" src={qrCode?.imgData} alt="QR Code" />
            <div style={{ margin: '10px 0', fontSize: '12px', color: '#888' }}>
              {qrCode ? '请扫码' : '正在加载...'}
            </div>
            <button
              className="modal-btn btn-cancel"
              style={{ width: 100 + '%', marginTop: '15px' }}
              onClick={() => {
                setIsLoginModalOpen(false);
                if (pollTimerRef.current) clearInterval(pollTimerRef.current);
              }}
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsModalOpen && (
        <SettingsModal
          initialSettings={settings}
          onSave={saveSettings}
          onClose={() => setIsSettingsModalOpen(false)}
        />
      )}
    </>
  );
}

// --- Subcomponents ---

function SettingsModal({ 
  initialSettings, 
  onSave, 
  onClose 
}: { 
  initialSettings: Settings, 
  onSave: (s: Settings) => void, 
  onClose: () => void 
}) {
  const [tempSettings, setTempSettings] = useState<Settings>(initialSettings);

  return (
    <div className="modal-overlay active">
      <div className="modal-content" style={{ width: '380px', maxHeight: '420px', overflowY: 'auto' }}>
        <button className="modal-close-icon" onClick={onClose} title="关闭且不保存">
          <svg viewBox="0 0 10 10"><path d="M10 1L9 0 5 4 1 0 0 1l4 4-4 4 1 1 4-4 4 4 1-1-4-4z" /></svg>
        </button>
        <h3 style={{ marginTop: 0, marginBottom: '20px', color: '#fff' }}>⚙️ 偏好设置</h3>

        <div className="setting-item">
          <span className="setting-title">默认下载保存目录</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              readOnly
              value={tempSettings.downloadDir}
              style={{ flex: 1, padding: '8px', background: '#222', border: '1px solid #444', color: '#ccc', borderRadius: '4px', fontSize: '12px', outline: 'none', cursor: 'pointer' }}
            />
            <button 
              className="download-btn secondary-btn"
              onClick={async () => {
                const folder = await window.api.selectFolder();
                if (folder) setTempSettings(prev => ({ ...prev, downloadDir: folder }));
              }}
            >
              更改
            </button>
          </div>
        </div>

        <div className="setting-item" style={{ marginTop: '25px' }}>
          <label className="option-label">
            <input
              type="checkbox"
              checked={tempSettings.clipboardMonitor}
              onChange={(e) => setTempSettings(prev => ({ ...prev, clipboardMonitor: e.target.checked }))}
            />
            自动监听并提取剪贴板链接
          </label>
        </div>

        <div className="setting-item" style={{ marginTop: '15px' }}>
          <label className="option-label">
            <input
              type="checkbox"
              checked={tempSettings.dlSub}
              onChange={(e) => setTempSettings(prev => ({ ...prev, dlSub: e.target.checked }))}
            />
            下载并封装双轨字幕 (人工+AI)
          </label>
        </div>

        <div className="setting-item" style={{ marginTop: '15px' }}>
          <label className="option-label">
            <input
              type="checkbox"
              checked={tempSettings.multiThread}
              onChange={(e) => setTempSettings(prev => ({ ...prev, multiThread: e.target.checked }))}
            />
            开启多线程并发加速 (-mt)
          </label>
        </div>

        <div className="setting-item" style={{ marginTop: '15px' }}>
          <label className="option-label">
            <input
              type="checkbox"
              checked={tempSettings.closeToTray}
              onChange={(e) => setTempSettings(prev => ({ ...prev, closeToTray: e.target.checked }))}
            />
            点击关闭按钮时隐藏到系统托盘
          </label>
        </div>

        <div className="setting-item" style={{ marginTop: '15px' }}>
          <label className="option-label">
            <input
              type="checkbox"
              checked={tempSettings.notifyState}
              onChange={(e) => setTempSettings(prev => ({ ...prev, notifyState: e.target.checked }))}
            />
            任务完成时弹出系统横幅通知
          </label>
        </div>

        <div className="setting-item" style={{ marginTop: '15px' }}>
          <label className="option-label">
            <input
              type="checkbox"
              checked={tempSettings.soundState}
              onChange={(e) => setTempSettings(prev => ({ ...prev, soundState: e.target.checked }))}
            />
            任务完成时播放系统提示音
          </label>
        </div>

        <div style={{ marginTop: '30px' }}>
          <button className="modal-btn btn-save" onClick={() => onSave(tempSettings)} style={{ width: 100 + '%' }}>
            保存并应用
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
