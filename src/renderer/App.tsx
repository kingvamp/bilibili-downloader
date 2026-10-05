// 主界面：连接认证、设置和统一下载流程，将状态传给各展示组件。
import { useState, useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import { useSettings } from './hooks/useSettings';
import { useDownload } from './hooks/useDownload';

import { Header } from './components/layout/Header';
import { LogPanel } from './components/sections/LogPanel';
import { ProgressSection } from './components/sections/ProgressSection';
import { DownloadForm } from './components/sections/DownloadForm';

import { LoginModal } from './components/modals/LoginModal';
import { SettingsModal } from './components/modals/SettingsModal';
import { ConfirmModal } from './components/modals/ConfirmModal';
import { MissingVideosModal } from './components/modals/MissingVideosModal';

/** 组装下载界面及其弹窗和流程控制入口。 */
function App() {
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // 1. Settings Hook
  const { settings, saveSettings, isReady, isSaving } = useSettings((msg) => {
    // This is a bootstrap appendLog for settings toggle
    // We'll use the one from useDownload for most things
  });

  // 2. Download Hook (Logic core)
  const {
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
    handleDownloadDefaultFav,
    handlePause,
    handleResume,
    handleStop,
    clearLogs,
    checkAndAddTasks,
    handleDetectFavlist,
    handleCollectAll,
    isDetecting,
    isMissingVideosModalOpen,
    setIsMissingVideosModalOpen,
    missingVideosResult,
    appendLog,
  } = useDownload(settings);

  // 3. Auth Hook
  const {
    userInfo,
    qrCode,
    isLoginModalOpen,
    setIsLoginModalOpen,
    startLogin,
    handleLogout,
  } = useAuth(appendLog);

  // Listeners
  useEffect(() => {
    window.api.onOpenSettings(() => setIsSettingsModalOpen(true));
  }, []);

  return (
    <>
      <Header 
        userInfo={userInfo} 
        onLogin={startLogin} 
        onOpenSettings={() => setIsSettingsModalOpen(true)} 
        onLogout={handleLogout}
      />

      <main>
        <DownloadForm
          userInfo={userInfo}
          urlInput={urlInput}
          setUrlInput={setUrlInput}
          isWorkflowBusy={isWorkflowBusy}
          isCheckingDuplicates={isCheckingDuplicates}
          hasTasks={totalTasks > 0}
          onDownload={handleDownload}
          onCheckAndAddTasks={checkAndAddTasks}
          onDownloadDefaultFav={handleDownloadDefaultFav}
          onDetectFavlist={handleDetectFavlist}
          isDetecting={isDetecting}
          appendLog={appendLog}
        />

        <ProgressSection
          totalTasks={totalTasks}
          completedTasks={completedTasks}
          isDownloading={isDownloading}
          subProgress={subProgress}
        />

        <div className="log-container" style={{ position: 'relative', flex: 1, minHeight: 0, width: '100%', maxWidth: '600px', display: 'flex', flexDirection: 'column' }}>
          <LogPanel logs={logs} />
          <button 
            className="clear-log-btn"
            style={{
              position: 'absolute',
              top: '10px',
              right: '25px',
              background: 'rgba(0,0,0,0.5)',
              border: '1px solid #444',
              color: '#888',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              cursor: 'pointer',
              zIndex: 10
            }}
            onClick={clearLogs}
          >
            清空日志
          </button>
        </div>

        <div className="control-group" style={{ marginTop: '15px' }}>
          {isDownloading ? (
              <button className="control-btn pause-btn" onClick={handlePause}>
                <svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                暂停预览/下载
              </button>
          ) : (
            <button className="control-btn resume-btn" onClick={handleResume} disabled={!isPaused}>
              <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              继续
            </button>
          )}
          <button className="control-btn stop-btn" onClick={handleStop} disabled={!isWorkflowBusy}>
            <svg viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/></svg>
            停止全部任务
          </button>
        </div>
      </main>

      {/* Modals */}
      {isLoginModalOpen && (
        <LoginModal 
          qrCode={qrCode} 
          onClose={() => setIsLoginModalOpen(false)} 
        />
      )}

      {isSettingsModalOpen && isReady && (
        <SettingsModal
          initialSettings={settings}
          isSaving={isSaving}
          onSave={async (newSettings) => {
            if (await saveSettings(newSettings)) setIsSettingsModalOpen(false);
          }}
          onClose={() => setIsSettingsModalOpen(false)}
        />
      )}

      {/* 单视频重复下载确认弹窗 */}
      {redownloadConfirm && (
        <ConfirmModal
          videoTitle={redownloadConfirm.videoTitle}
          bvid={redownloadConfirm.bvid}
          onConfirm={() => handleRedownloadResponse(true)}
          onCancel={() => handleRedownloadResponse(false)}
        />
      )}

      {isMissingVideosModalOpen && (
        <MissingVideosModal
          results={missingVideosResult}
          onDownloadAll={() => {
            const missing = missingVideosResult.filter(r => !r.isDownloaded);
            checkAndAddTasks(missing.map(m => m.bvid), false);
            setIsMissingVideosModalOpen(false);
          }}
          onCollectAll={handleCollectAll}
          onClose={() => setIsMissingVideosModalOpen(false)}
        />
      )}
    </>
  );
}

export default App;
