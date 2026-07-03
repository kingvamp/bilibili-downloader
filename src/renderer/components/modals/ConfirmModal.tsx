// ConfirmModal.tsx
// 单个视频已下载时的重新下载确认弹窗，与 MissingVideosModal / LoginModal 风格统一。
// 通过 onConfirm / onCancel 回调将结果传回 useDownload 的 Promise 解析器。

interface ConfirmModalProps {
  /** 视频标题，用于弹窗展示 */
  videoTitle: string;
  /** BV 号，标题为空时兜底显示 */
  bvid: string;
  /** 用户点击"重新下载" */
  onConfirm: () => void;
  /** 用户点击"跳过" */
  onCancel: () => void;
}

export function ConfirmModal({ videoTitle, bvid, onConfirm, onCancel }: ConfirmModalProps) {
  const displayTitle = videoTitle && videoTitle !== bvid ? videoTitle : bvid;

  return (
    <div className="modal-overlay active">
      <div
        className="modal-content"
        style={{ width: '400px', textAlign: 'left', padding: '28px 28px 24px' }}
      >
        {/* 标题行 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <span style={{ fontSize: '22px', lineHeight: 1 }}>⚠️</span>
          <h3 style={{ margin: 0, fontSize: '15px', color: '#fff', fontWeight: 600 }}>
            该视频已在下载历史中
          </h3>
        </div>

        {/* 视频信息卡片 */}
        <div
          style={{
            background: '#1a1a1a',
            border: '1px solid #383838',
            borderRadius: '8px',
            padding: '12px 14px',
            marginBottom: '22px',
          }}
        >
          <div
            style={{
              color: '#eee',
              fontSize: '13px',
              lineHeight: 1.5,
              wordBreak: 'break-all',
              marginBottom: '6px',
            }}
          >
            {displayTitle}
          </div>
          <div style={{ color: '#555', fontSize: '11px', fontFamily: 'Consolas, monospace' }}>
            {bvid}
          </div>
        </div>

        {/* 提示文字 */}
        <p style={{ fontSize: '12px', color: '#888', margin: '0 0 20px', lineHeight: 1.6 }}>
          该视频曾经已成功下载。如果本地文件已删除，可以选择重新下载。
        </p>

        {/* 操作按钮 */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className="modal-btn btn-save"
            onClick={onConfirm}
            style={{ flex: 1, fontSize: '13px' }}
          >
            重新下载
          </button>
          <button
            className="modal-btn btn-cancel"
            onClick={onCancel}
            style={{ flex: 1, fontSize: '13px' }}
          >
            跳过
          </button>
        </div>
      </div>
    </div>
  );
}
