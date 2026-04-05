import { useState } from 'react';
import { Settings } from '../../types';

interface SettingsModalProps {
  initialSettings: Settings;
  onSave: (s: Settings) => void;
  onClose: () => void;
}

export function SettingsModal({ 
  initialSettings, 
  onSave, 
  onClose 
}: SettingsModalProps) {
  const [tempSettings, setTempSettings] = useState<Settings>(initialSettings);

  return (
    <div className="modal-overlay active">
      <div className="modal-content settings-content">
        <button className="modal-close-icon" onClick={onClose} title="关闭且不保存">
          <svg viewBox="0 0 10 10"><path d="M10 1L9 0 5 4 1 0 0 1l4 4-4 4 1 1 4-4 4 4 1-1-4-4z" /></svg>
        </button>
        <h3 style={{ marginTop: 0, marginBottom: '20px', color: '#fff', textAlign: 'center' }}>⚙️ 偏好设置</h3>

        <div className="settings-scroll-area">
          <div className="setting-section-header">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
             下载设置
          </div>

          <div className="setting-item">
            <span className="setting-title">默认下载保存目录</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                readOnly
                value={tempSettings.downloadDir}
                className="setting-input-field"
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

          <div className="setting-section-header">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-11v6h2v-6h-2zm0-4v2h2V7h-2z"/></svg>
             通用选项
          </div>

          <div className="setting-item">
            <label className="option-label">
              <input
                type="checkbox"
                checked={tempSettings.clipboardMonitor}
                onChange={(e) => setTempSettings(prev => ({ ...prev, clipboardMonitor: e.target.checked }))}
              />
              自动监听并提取剪贴板链接
            </label>
          </div>

          <div className="setting-item" style={{ marginTop: '12px' }}>
            <label className="option-label">
              <input
                type="checkbox"
                checked={tempSettings.dlSub}
                onChange={(e) => setTempSettings(prev => ({ ...prev, dlSub: e.target.checked }))}
              />
              下载并封装双轨字幕 (人工+AI)
            </label>
          </div>

          <div className="setting-item" style={{ marginTop: '12px' }}>
            <label className="option-label">
              <input
                type="checkbox"
                checked={tempSettings.multiThread}
                onChange={(e) => setTempSettings(prev => ({ ...prev, multiThread: e.target.checked }))}
              />
              开启多线程并发加速 (-mt)
            </label>
          </div>

          <div className="setting-item" style={{ marginTop: '12px' }}>
            <label className="option-label">
              <input
                type="checkbox"
                checked={tempSettings.closeToTray}
                onChange={(e) => setTempSettings(prev => ({ ...prev, closeToTray: e.target.checked }))}
              />
              点击关闭按钮时隐藏到系统托盘
            </label>
          </div>

          <div className="setting-item" style={{ marginTop: '12px' }}>
            <label className="option-label">
              <input
                type="checkbox"
                checked={tempSettings.notifyState}
                onChange={(e) => setTempSettings(prev => ({ ...prev, notifyState: e.target.checked }))}
              />
              任务完成时弹出系统横幅通知
            </label>
          </div>

          <div className="setting-item" style={{ marginTop: '12px' }}>
            <label className="option-label">
              <input
                type="checkbox"
                checked={tempSettings.soundState}
                onChange={(e) => setTempSettings(prev => ({ ...prev, soundState: e.target.checked }))}
              />
              任务完成时播放系统提示音
            </label>
          </div>

          <div className="setting-section-header" style={{ color: '#ff9800' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M22.7 19l-9.1-16c-.5-.8-1.4-1.3-2.4-1.3s-1.9.5-2.4 1.3L.3 19c-.5.8-.5 1.8 0 2.6.4.8 1.3 1.3 2.3 1.3h18.2c1 0 1.9-.5 2.3-1.3.5-.8.5-1.8.1-2.6zm-11.2.3c-.6 0-1.1-.5-1.1-1.1 0-.6.5-1.1 1.1-1.1.6 0 1.1.5 1.1 1.1 0 .6-.5 1.1-1.1 1.1zm1.5-4.8c0 .3-.1.5-.4.5h-2.2c-.3 0-.4-.2-.4-.5l-.2-4.7c0-.3.2-.5.5-.5h2.8c.3 0 .5.2.5.5l-.1 4.7z"/></svg>
            维护与同步
          </div>
          
          <div className="maintenance-card">
            <div className="maintenance-tip">
              如果你手动移动了已下载的视频文件，可以通过此功能递归扫描目录，将发现的视频 BV 号重新同步到本地下载历史记录中，防止重复下载。
            </div>
            <button 
              className="download-btn secondary-btn" 
              style={{ width: '100%', justifyContent: 'center', height: '36px', background: '#333', border: '1px solid #555' }}
              onClick={async () => {
                const res = await window.api.scanFolderForHistory();
                if (res.success) {
                  alert(`📋 扫描完成！\n\n共发现 BV 号: ${res.foundCount} 个\n新添加到记录: ${res.addedCount} 个\n当前总记录数: ${res.totalInHistory} 个`);
                } else if (res.message !== '已取消') {
                  alert(`❌ 扫描失败: ${res.message}`);
                }
              }}
            >
              📂 选择目录并扫描同步历史
            </button>
          </div>
        </div>

        <div style={{ marginTop: '25px', display: 'flex', justifyContent: 'center' }}>
          <button className="modal-btn btn-save" onClick={() => onSave(tempSettings)} style={{ width: '100%', padding: '12px 0' }}>
            保存并应用配置
          </button>
        </div>
      </div>
    </div>
  );
}
