import { DuplicateResult } from '../../types';

interface MissingVideosModalProps {
  results: DuplicateResult[];
  onDownloadAll: () => void;
  onCollectAll: () => void;
  onClose: () => void;
}

export function MissingVideosModal({ 
  results, 
  onDownloadAll, 
  onCollectAll,
  onClose 
}: MissingVideosModalProps) {
  const missing = results.filter(r => !r.isDownloaded);

  return (
    <div className="modal-overlay active">
      <div className="modal-content" style={{ width: '500px', maxHeight: '550px', display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ marginTop: 0, color: '#00A1D6' }}>📋 发现未下载视频 ({missing.length} 个)</h3>
        <p style={{ fontSize: '13px', color: '#ccc', marginBottom: '15px' }}>
          以下是该收藏夹中尚未下载的视频列表：
        </p>
        
        <div className="missing-list" style={{ 
          background: '#1a1a1a', 
          padding: '10px', 
          borderRadius: '6px', 
          flex: 1,
          overflowY: 'auto',
          fontSize: '12px',
          textAlign: 'left',
          border: '1px solid #333'
        }}>
          {missing.length === 0 ? (
            <div style={{ color: '#888', textAlign: 'center', padding: '20px' }}>恭喜，该列表中的视频已全部下载完成！</div>
          ) : (
            missing.map((item, idx) => (
              <div key={idx} style={{ marginBottom: '8px', borderBottom: '1px solid #222', paddingBottom: '6px', display: 'flex', gap: '8px' }}>
                <span style={{ color: '#00A1D6', whiteSpace: 'nowrap' }}>{idx + 1}.</span>
                <div>
                  <div style={{ color: '#eee' }}>{item.title}</div>
                  <div style={{ color: '#666', fontSize: '11px' }}>{item.bvid}</div>
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {missing.length > 0 && (
            <>
              <button className="modal-btn btn-save" onClick={onDownloadAll}>
                直接下载全部未下载视频
              </button>
              <button 
                className="modal-btn" 
                style={{ background: '#f60', color: '#fff' }} 
                onClick={onCollectAll}
              >
                一键转存至默认收藏夹 (推荐，可破412错误)
              </button>
            </>
          )}
          <button className="modal-btn btn-cancel" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
