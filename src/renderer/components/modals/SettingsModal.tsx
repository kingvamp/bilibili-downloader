// SettingsModal.tsx
// 偏好设置弹窗：分为「下载设置」「收藏夹自动化」「通知与行为」「维护与同步」四个分组。
// 关联：useSettings.ts（读写 Settings）、types.ts（Settings 类型）。

import { useState, useEffect } from 'react';
import { Settings } from '../../types';

interface SettingsModalProps {
    initialSettings: Settings;
    onSave: (s: Settings) => void;
    onClose: () => void;
}

export function SettingsModal({
    initialSettings,
    onSave,
    onClose,
}: SettingsModalProps) {
    const [tempSettings, setTempSettings] = useState<Settings>(initialSettings);
    const [isScanning, setIsScanning] = useState(false);
    const [historyCount, setHistoryCount] = useState<number>(0);
    const [lastTriggeredTime, setLastTriggeredTime] = useState<number>(0);

    useEffect(() => {
        const fetchData = async () => {
            const count = await window.api.getHistoryCount();
            setHistoryCount(count);
            const time = await window.api.getLastTriggeredTime();
            setLastTriggeredTime(time);
        };
        fetchData();
    }, []);

    return (
        <div className="modal-overlay active">
            <div className="modal-content settings-content" style={{ paddingTop: '16px' }}>
                <button className="modal-close-icon" onClick={onClose} title="关闭且不保存">
                    <svg viewBox="0 0 10 10"><path d="M10 1L9 0 5 4 1 0 0 1l4 4-4 4 1 1 4-4 4 4 1-1-4-4z" /></svg>
                </button>
                <h3 style={{ marginTop: 0, marginBottom: '8px', color: '#fff', textAlign: 'center', fontSize: '14px' }}>⚙️ 偏好设置</h3>

                <div className="settings-scroll-area">
                    {/* ── 下载设置 ── */}
                    <div className="setting-section-header">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" /></svg>
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

                    {/* ── 收藏夹自动化 ── */}
                    <div className="setting-section-header" style={{ marginTop: '8px' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z" /></svg>
                        收藏夹自动化
                    </div>

                    <div className="setting-item">
                        <label className="option-label">
                            <input
                                type="checkbox"
                                checked={tempSettings.autoDownloadFav}
                                onChange={(e) => setTempSettings(prev => ({ ...prev, autoDownloadFav: e.target.checked }))}
                            />
                            自动下载收藏夹中的新视频
                        </label>
                        <div style={{ marginTop: '6px', fontSize: '12px', color: '#888', paddingLeft: '22px' }}>
                            {tempSettings.autoDownloadFav ? (
                                <>
                                    🟢 已启用，每小时检查一次，系统唤醒后立即检查。
                                    <br />
                                    {lastTriggeredTime > 0
                                        ? `上次下载时间: ${new Date(lastTriggeredTime).toLocaleString()}`
                                        : '上次下载时间: 暂无记录 (开启后 10s 内将触发首次检查)'}
                                </>
                            ) : (
                                '⚪ 未启用'
                            )}
                        </div>
                    </div>

                    <div className="setting-item" style={{ marginTop: '12px' }}>
                        <label className="option-label">
                            <input
                                type="checkbox"
                                checked={tempSettings.unfavAfterDownload}
                                onChange={(e) => setTempSettings(prev => ({ ...prev, unfavAfterDownload: e.target.checked }))}
                            />
                            下载完成后自动从收藏夹移除视频
                        </label>
                        <div style={{ marginTop: '6px', fontSize: '12px', paddingLeft: '22px', color: tempSettings.unfavAfterDownload ? '#ff9800' : '#888' }}>
                            {tempSettings.unfavAfterDownload
                                ? <>⚠️ 已启用，取消收藏<strong>不可逆</strong>，仅限"下载默认收藏夹"流程。</>
                                : '⚪ 未启用，下载后收藏夹保持不变'}
                        </div>
                    </div>

                    {/* ── 通知与行为 ── */}
                    <div className="setting-section-header" style={{ marginTop: '8px' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" /></svg>
                        通知与行为
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

                    {/* ── 维护与同步 ── */}
                    <div className="setting-section-header" style={{ color: '#ff9800', marginTop: '8px' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M22.7 19l-9.1-16c-.5-.8-1.4-1.3-2.4-1.3s-1.9.5-2.4 1.3L.3 19c-.5.8-.5 1.8 0 2.6.4.8 1.3 1.3 2.3 1.3h18.2c1 0 1.9-.5 2.3-1.3.5-.8.5-1.8.1-2.6zm-11.2.3c-.6 0-1.1-.5-1.1-1.1 0-.6.5-1.1 1.1-1.1.6 0 1.1.5 1.1 1.1 0 .6-.5 1.1-1.1 1.1zm1.5-4.8c0 .3-.1.5-.4.5h-2.2c-.3 0-.4-.2-.4-.5l-.2-4.7c0-.3.2-.5.5-.5h2.8c.3 0 .5.2.5.5l-.1 4.7z" /></svg>
                        维护与同步
                    </div>

                    <div className="maintenance-card">
                        <div className="maintenance-tip">
                            如果你手动移动了已下载的视频文件，可以通过此功能递归扫描目录，将发现的视频 BV 号重新同步到本地下载历史记录中，防止重复下载。
                            <div style={{ marginTop: '8px', color: '#ff9800', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM7 10h2v7H7zm4-3h2v10h-2zm4 6h2v4h-2z" /></svg>
                                当前本地已记录: {historyCount} 条
                            </div>
                        </div>
                        <button
                            className={`download-btn secondary-btn ${isScanning ? 'loading-btn' : ''}`}
                            style={{ width: '100%', justifyContent: 'center', height: '36px', background: '#333', border: '1px solid #555' }}
                            disabled={isScanning}
                            onClick={async () => {
                                setIsScanning(true);
                                try {
                                    const res = await window.api.scanFolderForHistory();
                                    if (res.success) {
                                        setHistoryCount(res.totalInHistory ?? 0);
                                        alert(`📋 扫描完成！\n\n共发现 BV 号: ${res.foundCount} 个\n新添加到记录: ${res.addedCount} 个\n当前总记录数: ${res.totalInHistory} 个`);
                                    } else if (res.message !== '已取消') {
                                        alert(`❌ 扫描失败: ${res.message}`);
                                    }
                                } finally {
                                    setIsScanning(false);
                                }
                            }}
                        >
                            {isScanning ? (
                                <>
                                    <div className="spinner"></div>
                                    <span>正在扫描中，请稍候...</span>
                                </>
                            ) : (
                                <>📂 选择目录并扫描同步历史</>
                            )}
                        </button>
                    </div>

                </div>{/* settings-scroll-area 结束 */}

                <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'center' }}>
                    <button className="modal-btn btn-save" onClick={() => onSave(tempSettings)} style={{ width: '100%', padding: '12px 0' }}>
                        保存并应用配置
                    </button>
                </div>
            </div>
        </div>
    );
}
