import { DuplicateResult } from '../../types';

interface DuplicateModalProps {
  results: DuplicateResult[];
  onConfirm: () => void;
  onClose: () => void;
}

export function DuplicateModal({ 
  results, 
  onConfirm, 
  onClose 
}: DuplicateModalProps) {
  const duplicates = results.filter(r => r.isDownloaded);

  return (
    <div className="modal-overlay active">
      <div className="modal-content" style={{ width: '450px', maxHeight: '500px' }}>
        <h3 style={{ marginTop: 0, color: '#ff9800' }}>⚠️ 检查到重复资源 ({duplicates.length} 个)</h3>
        <p style={{ fontSize: '13px', color: '#ccc' }}>以下 {duplicates.length} 个视频在下载历史记录中已存在：</p>
        
        <div className="duplicate-list" style={{ 
          background: '#1a1a1a', 
          padding: '10px', 
          borderRadius: '6px', 
          maxHeight: '200px', 
          overflowY: 'auto',
          fontSize: '12px',
          textAlign: 'left'
        }}>
          {duplicates.map((item, idx) => (
            <div key={idx} style={{ marginBottom: '8px', borderBottom: '1px solid #333', paddingBottom: '4px' }}>
              <span style={{ color: '#aaa' }}>[{item.bvid}]</span> {item.title}
            </div>
          ))}
        </div>

        <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button className="modal-btn btn-save" onClick={onConfirm} style={{ background: '#ff9800' }}>
            继续下载
          </button>
          <button className="modal-btn btn-cancel" onClick={onClose}>
            取消本次下载
          </button>
        </div>
      </div>
    </div>
  );
}
