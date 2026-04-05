import { useState, useRef, useEffect } from 'react';
import { UserInfo } from '../types';

export function useAuth(appendLog: (msg: string) => void) {
  const [userInfo, setUserInfo] = useState<UserInfo>({ isLogin: false });
  const [qrCode, setQrCode] = useState<{ imgData: string; key: string } | null>(null);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const checkUserStatus = async () => {
    const info = await window.api.getUserInfo();
    setUserInfo(info);
    if (info.isLogin && info.uname) {
      appendLog(`>>> 欢迎回来, ${info.uname} (高画质已激活)\n`);
    }
  };

  const startLogin = async () => {
    setIsLoginModalOpen(true);
    const res = await window.api.getQRCode();
    if (res.success && res.imgData && res.key) {
      setQrCode({ imgData: res.imgData, key: res.key });
      startPolling(res.key);
    }
  };

  const startPolling = (key: string) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = setInterval(async () => {
      const check = await window.api.checkLogin(key);
      if (check.status === 'success') {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        setIsLoginModalOpen(false);
        checkUserStatus();
        alert('登录成功！');
      }
    }, 3000);
  };

  const handleLogout = async () => {
    await window.api.logout();
    setUserInfo({ isLogin: false });
    appendLog(`>>> 🚪 已退出登录并清除当前凭据，请重新扫码获取新凭据\n`);
  };

  useEffect(() => {
    checkUserStatus();
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  return {
    userInfo,
    qrCode,
    isLoginModalOpen,
    setIsLoginModalOpen,
    startLogin,
    checkUserStatus,
    handleLogout,
  };

}
