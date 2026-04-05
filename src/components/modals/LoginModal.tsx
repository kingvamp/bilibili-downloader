interface LoginModalProps {
  qrCode: { imgData: string; key: string } | null;
  onClose: () => void;
}

export function LoginModal({ qrCode, onClose }: LoginModalProps) {
  return (
    <div className="modal-overlay active">
      <div className="modal-content">
        <h3 style={{ marginTop: 0 }}>📱 扫码登录</h3>
        <img id="qr-img" src={qrCode?.imgData} alt="QR Code" />
        <div style={{ margin: '10px 0', fontSize: '12px', color: '#888' }}>
          {qrCode ? '请扫码' : '正在加载...'}
        </div>
        <button
          className="modal-btn btn-cancel"
          style={{ width: 100 + '%', marginTop: '15px' }}
          onClick={onClose}
        >
          关闭
        </button>
      </div>
    </div>
  );
}
