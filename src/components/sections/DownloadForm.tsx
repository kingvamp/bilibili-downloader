import { UserInfo } from '../../types';

interface DownloadFormProps {
  userInfo: UserInfo;
  urlInput: string;
  setUrlInput: (val: string) => void;
  isDownloading: boolean;
  isPaused: boolean;
  isCheckingDuplicates: boolean;
  hasTasks: boolean;
  onDownload: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onCheckAndAddTasks: (urls: string[], isSilent: boolean) => void;
  appendLog: (msg: string) => void;
}

export function DownloadForm({
  userInfo,
  urlInput,
  setUrlInput,
  isDownloading,
  isPaused,
  isCheckingDuplicates,
  hasTasks,
  onDownload,
  onPause,
  onResume,
  onStop,
  onCheckAndAddTasks,
  appendLog
}: DownloadFormProps) {
  return (
    <>
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
          onClick={async () => {
            if (!userInfo.mid) return alert('请先扫码登录后再使用此功能');
            const url = `https://space.bilibili.com/${userInfo.mid}/favlist`;
            appendLog(`\n>>> 📂 已触发个人收藏夹全量解析...\n`);
            onCheckAndAddTasks([url], false);
          }}
        >
          <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
          下载默认收藏夹
        </button>
      </div>

      <div className="input-group">
        <input
          type="text"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="粘贴视频链接、收藏夹链接 或 播单数字ID (支持多行批量)"
        />
        <button 
          className="download-btn" 
          onClick={onDownload} 
          disabled={isDownloading || isPaused || isCheckingDuplicates || (urlInput.trim() === '' && !hasTasks)}
        >
          {isCheckingDuplicates ? '预查重中...' : '解析并下载'}
        </button>
      </div>

      <div className="control-group">
        {isDownloading ? (
            <button className="control-btn pause-btn" onClick={onPause}>
              <svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
              暂停
            </button>
        ) : (
          <button className="control-btn resume-btn" onClick={onResume} disabled={!isPaused}>
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            继续
          </button>
        )}
        <button className="control-btn stop-btn" onClick={onStop} disabled={!isDownloading && !isPaused && !hasTasks}>
          <svg viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/></svg>
          停止
        </button>
      </div>
    </>
  );
}
