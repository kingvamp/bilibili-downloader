// SettingsModal.tsx
// 偏好设置弹窗：分为「下载设置」「收藏夹自动化」「通知与行为」「维护与同步」四个分组。
// 关联：useSettings.ts（读写 Settings）、types.ts（Settings 类型）。

import { useState, useEffect } from 'react';
import { Settings } from '../../types';
import './SettingsModal.css';

interface SettingsModalProps {
    initialSettings: Settings;
    onSave: (s: Settings) => Promise<void>;
    isSaving: boolean;
    onClose: () => void;
}

/** 展示单列设置分组，保留暂存、保存及历史扫描的现有交互。 */
export function SettingsModal({
    initialSettings,
    isSaving,
    onSave,
    onClose,
}: SettingsModalProps) {
    const [tempSettings, setTempSettings] = useState<Settings>(initialSettings);
    const [isScanning, setIsScanning] = useState(false);
    const [historyCount, setHistoryCount] = useState<number | null>(null);
    const [historyError, setHistoryError] = useState<string | null>(null);
    const [lastTriggeredTime, setLastTriggeredTime] = useState<number>(0);

    useEffect(() => {
        let active = true;
        void window.api.getHistoryCount().then(count => {
            if (active) setHistoryCount(count);
        }).catch(error => {
            if (active) setHistoryError(`历史读取失败：${String(error)}`);
        });
        void window.api.getLastTriggeredTime().then(time => {
            if (active) setLastTriggeredTime(time);
        }).catch(error => console.error('读取自动下载时间失败:', error));
        return () => { active = false; };
    }, []);

    return (
        <div className="modal-overlay active">
            <div className="modal-content settings-content" role="dialog" aria-modal="true" aria-labelledby="settings-title">
                <div className="settings-header">
                    <h2 id="settings-title">偏好设置</h2>
                    <button className="modal-close-icon settings-close-button" onClick={onClose} title="关闭且不保存" aria-label="关闭设置">
                        <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M10 1L9 0 5 4 1 0 0 1l4 4-4 4 1 1 4-4 4 4 1-1-4-4z" /></svg>
                    </button>
                </div>

                <div className="settings-scroll-area">
                    {/* ── 下载设置 ── */}
                    <section className="settings-section" aria-labelledby="settings-download-title">
                        <h3 id="settings-download-title">下载设置</h3>
                        <div className="settings-directory">
                            <label className="settings-description" htmlFor="settings-download-directory">默认下载保存目录</label>
                            <div className="settings-directory-controls">
                                <input
                                    id="settings-download-directory"
                                    type="text"
                                    readOnly
                                    value={tempSettings.downloadDir}
                                    title={tempSettings.downloadDir}
                                    className="settings-directory-input"
                                />
                                <button
                                    className="download-btn secondary-btn settings-secondary-button"
                                    onClick={async () => {
                                        const folder = await window.api.selectFolder();
                                        if (folder) setTempSettings(prev => ({ ...prev, downloadDir: folder }));
                                    }}
                                >
                                    更改目录
                                </button>
                            </div>
                        </div>
                        <label className="settings-row">
                            <span className="settings-row-copy">
                                下载并封装双轨字幕
                                <span className="settings-description">人工字幕 + AI 字幕</span>
                            </span>
                            <input
                                type="checkbox"
                                checked={tempSettings.dlSub}
                                onChange={(e) => setTempSettings(prev => ({ ...prev, dlSub: e.target.checked }))}
                            />
                        </label>
                        <label className="settings-row">
                            <span className="settings-row-copy">多线程下载</span>
                            <input
                                type="checkbox"
                                checked={tempSettings.multiThread}
                                onChange={(e) => setTempSettings(prev => ({ ...prev, multiThread: e.target.checked }))}
                            />
                        </label>
                    </section>

                    {/* ── 收藏夹自动化 ── */}
                    <section className="settings-section" aria-labelledby="settings-favorites-title">
                        <h3 id="settings-favorites-title">收藏夹自动化</h3>
                        <label className="settings-row settings-row-detailed">
                            <span className="settings-row-copy">
                                自动下载默认收藏夹的新视频
                                <span className="settings-description">每小时检查一次，系统唤醒后立即检查。</span>
                                <span className="settings-description">
                                    {lastTriggeredTime > 0
                                        ? `上次下载时间：${new Date(lastTriggeredTime).toLocaleString()}`
                                        : '上次下载时间：暂无记录'}
                                </span>
                                {tempSettings.autoDownloadFav && (
                                    <span className="settings-description">开启并保存后立即检查；应用启动 10 秒后检查。</span>
                                )}
                            </span>
                            <input
                                type="checkbox"
                                checked={tempSettings.autoDownloadFav}
                                onChange={(e) => setTempSettings(prev => ({ ...prev, autoDownloadFav: e.target.checked }))}
                            />
                        </label>
                        <label className="settings-row settings-row-detailed">
                            <span className="settings-row-copy">
                                下载后移除收藏
                                <span className="settings-description">仅作用于“下载默认收藏夹”流程</span>
                                <span className={`settings-description${tempSettings.unfavAfterDownload ? ' settings-warning' : ''}`}>
                                    {tempSettings.unfavAfterDownload
                                        ? <>取消收藏<strong>不可逆</strong>，请谨慎启用。</>
                                        : '未启用时，下载后收藏夹保持不变。'}
                                </span>
                            </span>
                            <input
                                type="checkbox"
                                checked={tempSettings.unfavAfterDownload}
                                onChange={(e) => setTempSettings(prev => ({ ...prev, unfavAfterDownload: e.target.checked }))}
                            />
                        </label>
                    </section>

                    {/* ── 通知与行为 ── */}
                    <section className="settings-section" aria-labelledby="settings-behavior-title">
                        <h3 id="settings-behavior-title">通知与行为</h3>
                        <label className="settings-row">
                            <span className="settings-row-copy">自动提取剪贴板链接</span>
                            <input
                                type="checkbox"
                                checked={tempSettings.clipboardMonitor}
                                onChange={(e) => setTempSettings(prev => ({ ...prev, clipboardMonitor: e.target.checked }))}
                            />
                        </label>
                        <label className="settings-row">
                            <span className="settings-row-copy">关闭窗口时隐藏到托盘</span>
                            <input
                                type="checkbox"
                                checked={tempSettings.closeToTray}
                                onChange={(e) => setTempSettings(prev => ({ ...prev, closeToTray: e.target.checked }))}
                            />
                        </label>
                        <label className="settings-row">
                            <span className="settings-row-copy">完成时显示系统通知</span>
                            <input
                                type="checkbox"
                                checked={tempSettings.notifyState}
                                onChange={(e) => setTempSettings(prev => ({ ...prev, notifyState: e.target.checked }))}
                            />
                        </label>
                        <label className="settings-row">
                            <span className="settings-row-copy">完成时播放提示音</span>
                            <input
                                type="checkbox"
                                checked={tempSettings.soundState}
                                onChange={(e) => setTempSettings(prev => ({ ...prev, soundState: e.target.checked }))}
                            />
                        </label>
                    </section>

                    {/* ── 维护与同步：扫描直接更新历史，不受底部保存或取消影响。 ── */}
                    <section className="settings-section" aria-labelledby="settings-maintenance-title">
                        <h3 id="settings-maintenance-title">维护与同步</h3>
                        <div className="settings-maintenance">
                            <div className="settings-maintenance-copy">
                                <span>本地下载历史</span>
                                <p className="settings-description">移动视频文件后，可递归扫描目录中的 BV 号，补充历史记录以避免重复下载。</p>
                                <p className={`settings-description${historyError ? ' settings-error' : ''}`} role="status">
                                    {historyError ?? (historyCount === null ? '正在读取本地历史...' : `当前本地已记录：${historyCount} 条`)}
                                </p>
                                <p className="settings-description">扫描会立即更新历史，无需保存设置。</p>
                            </div>
                            <button
                                className="download-btn secondary-btn settings-secondary-button"
                                disabled={isScanning}
                                onClick={async () => {
                                    setIsScanning(true);
                                    try {
                                        const res = await window.api.scanFolderForHistory();
                                        if (res.success) {
                                            setHistoryCount(res.totalInHistory);
                                            setHistoryError(null);
                                            alert(`📋 扫描完成！\n\n共发现 BV 号: ${res.foundCount} 个\n新添加到记录: ${res.addedCount} 个\n当前总记录数: ${res.totalInHistory} 个`);
                                        } else if (res.message !== '已取消') {
                                            alert(`❌ 扫描失败: ${res.message}`);
                                        }
                                    } catch (error) {
                                        alert(`❌ 扫描失败: ${String(error)}`);
                                    } finally {
                                        setIsScanning(false);
                                    }
                                }}
                            >
                                {isScanning ? (
                                    <>
                                        <span className="spinner" aria-hidden="true"></span>
                                        <span>正在扫描中，请稍候...</span>
                                    </>
                                ) : (
                                    '选择目录并扫描'
                                )}
                            </button>
                        </div>
                    </section>
                </div>{/* settings-scroll-area 结束 */}

                <div className="settings-footer">
                    <span className="settings-description">设置修改在保存后生效</span>
                    <div className="settings-footer-actions">
                        <button className="modal-btn btn-cancel" onClick={onClose}>取消</button>
                        <button className="modal-btn btn-save" disabled={isSaving} onClick={() => void onSave(tempSettings)}>
                            {isSaving ? '正在保存...' : '保存设置'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
