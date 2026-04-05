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
