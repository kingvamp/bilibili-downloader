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
import { DuplicateModal } from './components/modals/DuplicateModal';
import { MissingVideosModal } from './components/modals/MissingVideosModal';

function App() {
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // 1. Settings Hook
  const { settings, saveSettings } = useSettings((msg) => {
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
          isDownloading={isDownloading}
          isPaused={isPaused}
          isCheckingDuplicates={isCheckingDuplicates}
          hasTasks={totalTasks > 0}
          onDownload={handleDownload}
          onPause={handlePause}
          onResume={handleResume}
          onStop={handleStop}
          onCheckAndAddTasks={checkAndAddTasks}
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

        <LogPanel logs={logs} />
      </main>

      {/* Modals */}
      {isLoginModalOpen && (
        <LoginModal 
          qrCode={qrCode} 
          onClose={() => setIsLoginModalOpen(false)} 
        />
      )}

      {isSettingsModalOpen && (
        <SettingsModal
          initialSettings={settings}
          onSave={(newSettings) => {
            saveSettings(newSettings);
            setIsSettingsModalOpen(false);
          }}
          onClose={() => setIsSettingsModalOpen(false)}
        />
      )}

      {isDuplicateModalOpen && (
        <DuplicateModal
          results={duplicateResults}
          onConfirm={() => {
            addToQueue(pendingTasks);
            setIsDuplicateModalOpen(false);
          }}
          onClose={() => setIsDuplicateModalOpen(false)}
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
          onClose={() => setIsMissingVideosModalOpen(false)}
        />
      )}
    </>
  );
}

export default App;
