interface IElectronAPI {
    startDownload: (url: string, isBatch?: boolean, dlSub?: boolean, downloadDir?: string, isSilent?: boolean, isMultiThread?: boolean) => void;
    onProgress: (callback: (data: string) => void) => void;
    onComplete: (callback: (code: number) => void) => void;
    getQRCode: () => Promise<{ success: boolean; imgData?: string; key?: string; error?: string }>;
    checkLogin: (key: string) => Promise<{ status: string; msg?: string }>;
    getUserInfo: () => Promise<{ isLogin: boolean; uname?: string; face?: string }>;
    
    selectFolder: () => Promise<string | null>;
    setClipboardMonitor: (state: boolean) => void;
    setCloseToTray: (state: boolean) => void;
    onClipboardMatch: (callback: (url: string) => void) => void;
    onSilentClipboardMatch: (callback: (url: string) => void) => void; 
    onOpenSettings: (callback: () => void) => void;
    
    minWindow: () => void;
    maxWindow: () => void;
    closeWindow: () => void;
}

interface Window {
    api: IElectronAPI;
}

document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('loginBtn') as HTMLButtonElement;
    const userProfile = document.getElementById('userProfile') as HTMLDivElement;
    const userFace = document.getElementById('userFace') as HTMLImageElement;
    const userName = document.getElementById('userName') as HTMLSpanElement;
    const loginModal = document.getElementById('loginModal') as HTMLDivElement;
    const qrImg = document.getElementById('qr-img') as HTMLImageElement;
    const qrStatus = document.getElementById('qr-status') as HTMLDivElement;
    const logDiv = document.getElementById('log') as HTMLDivElement;
    
    const urlInput = document.getElementById('urlInput') as HTMLInputElement;
    const downloadBtn = document.getElementById('downloadBtn') as HTMLButtonElement;
    
    const openSettingsBtn = document.getElementById('openSettingsBtn') as HTMLButtonElement;
    const settingsModal = document.getElementById('settingsModal') as HTMLDivElement;
    const saveSettingsBtn = document.getElementById('saveSettingsBtn') as HTMLButtonElement;
    const closeSettingsIcon = document.getElementById('closeSettingsIcon') as HTMLButtonElement;
    
    const dirInput = document.getElementById('dirInput') as HTMLInputElement;
    const browseBtn = document.getElementById('browseBtn') as HTMLButtonElement;
    const subCb = document.getElementById('subCb') as HTMLInputElement;
    const clipboardCb = document.getElementById('clipboardCb') as HTMLInputElement;
    const mtCb = document.getElementById('mtCb') as HTMLInputElement;
    const trayCb = document.getElementById('trayCb') as HTMLInputElement;

    // === 任务队列引擎 ===
    let downloadQueue: { url: string, isSilent: boolean }[] = [];
    let isDownloading = false;

    function processQueue() {
        if (downloadQueue.length === 0) {
            isDownloading = false;
            if (logDiv) {
                logDiv.innerText += `\n>>> 🟢 所有队列任务已执行完毕，等待新任务...\n`;
                logDiv.scrollTop = logDiv.scrollHeight;
            }
            return;
        }

        isDownloading = true;
        const task = downloadQueue.shift();
        if (!task) return;

        let inputUrl = task.url;
        let isBatch = false;
        const isDlSub = localStorage.getItem('dlSub') === 'true';
        const currentDir = localStorage.getItem('downloadDir') || './downloads';
        const isMt = localStorage.getItem('multiThread') === 'true';

        if (/^\d+$/.test(inputUrl)) {
            inputUrl = `https://www.bilibili.com/list/ml${inputUrl}`;
            isBatch = true;
            if(logDiv && !task.isSilent) logDiv.innerText += `\n>>> 🤖 智能识别：纯数字 ID，转换为播单链接...\n`;
        } 
        else if (
            inputUrl.includes('list/ml') || 
            inputUrl.includes('favlist') || 
            inputUrl.includes('fid=') || 
            inputUrl.includes('collection') || 
            inputUrl.includes('/series/') || 
            inputUrl.includes('sid=')
        ) {
            isBatch = true;
            if(logDiv && !task.isSilent) logDiv.innerText += `\n>>> 🤖 智能识别：检测到列表特征...\n`;
        }

        if (logDiv) {
            logDiv.innerText += `\n>>> 🚀 开始处理队列任务: ${inputUrl}\n`;
            logDiv.scrollTop = logDiv.scrollHeight;
        }

        window.api.startDownload(inputUrl, isBatch, isDlSub, currentDir, task.isSilent, isMt);
    }

    function loadRealSettingsToUI() {
        const savedDir = localStorage.getItem('downloadDir') || './downloads';
        const savedClipboard = localStorage.getItem('clipboardMonitor') === 'true'; 
        const savedSub = localStorage.getItem('dlSub') === 'true'; 
        const savedMt = localStorage.getItem('multiThread') === 'true'; 
        const savedTray = localStorage.getItem('closeToTray') !== 'false'; 

        if (dirInput) dirInput.value = savedDir;
        if (subCb) subCb.checked = savedSub;
        if (clipboardCb) clipboardCb.checked = savedClipboard;
        if (mtCb) mtCb.checked = savedMt;
        if (trayCb) trayCb.checked = savedTray; 
    }

    loadRealSettingsToUI();
    const initialTray = localStorage.getItem('closeToTray') !== 'false';
    window.api.setCloseToTray(initialTray);
    
    if (localStorage.getItem('clipboardMonitor') === 'true') {
        window.api.setClipboardMonitor(true);
        if (logDiv) logDiv.innerText += `>>> 📋 剪贴板监听已按偏好设置自动开启\n`;
    }

    openSettingsBtn?.addEventListener('click', () => {
        loadRealSettingsToUI();
        if(settingsModal) settingsModal.style.display = 'flex';
    });

    window.api.onOpenSettings(() => {
        loadRealSettingsToUI();
        if(settingsModal) settingsModal.style.display = 'flex';
    });

    closeSettingsIcon?.addEventListener('click', () => {
        if(settingsModal) settingsModal.style.display = 'none';
    });

    browseBtn?.addEventListener('click', async () => {
        const folderPath = await window.api.selectFolder();
        if (folderPath) {
            dirInput.value = folderPath; 
        }
    });

    saveSettingsBtn?.addEventListener('click', () => {
        const newDir = dirInput?.value || './downloads';
        const newSub = subCb?.checked || false;
        const newClipboard = clipboardCb?.checked || false;
        const newMt = mtCb?.checked || false; 
        const newTray = trayCb?.checked ?? true; 

        const oldClipboard = localStorage.getItem('clipboardMonitor') === 'true';
        const oldTray = localStorage.getItem('closeToTray') !== 'false'; 

        localStorage.setItem('downloadDir', newDir);
        localStorage.setItem('dlSub', String(newSub));
        localStorage.setItem('clipboardMonitor', String(newClipboard));
        localStorage.setItem('multiThread', String(newMt)); 
        localStorage.setItem('closeToTray', String(newTray)); 

        if (oldClipboard !== newClipboard) {
            window.api.setClipboardMonitor(newClipboard);
            if (logDiv) {
                logDiv.innerText += newClipboard ? `\n>>> 📋 剪贴板监听已开启。\n` : `\n>>> ⏸️ 剪贴板监听已关闭。\n`;
                logDiv.scrollTop = logDiv.scrollHeight;
            }
        }

        if (oldTray !== newTray) {
            window.api.setCloseToTray(newTray);
        }

        if(settingsModal) settingsModal.style.display = 'none';
    });

    document.getElementById('minBtn')?.addEventListener('click', () => window.api.minWindow());
    document.getElementById('maxBtn')?.addEventListener('click', () => window.api.maxWindow());
    document.getElementById('closeBtn')?.addEventListener('click', () => window.api.closeWindow());

    async function checkUserStatus() {
        if (!window.api) return;
        const info = await window.api.getUserInfo();
        if (info.isLogin && info.uname && info.face) {
            if(loginBtn) loginBtn.style.display = 'none';
            if(userProfile) userProfile.style.display = 'flex';
            if(userName) userName.innerText = info.uname;
            if(userFace) userFace.src = info.face;
            if(logDiv) logDiv.innerText += `>>> 欢迎回来, ${info.uname} (高画质已激活)\n`;
        }
    }
    checkUserStatus();

    let pollTimer: NodeJS.Timeout | null = null;
    loginBtn?.addEventListener('click', async () => {
        if(loginModal) loginModal.style.display = 'flex';
        const res = await window.api.getQRCode();
        if (res.success && res.imgData && res.key) {
            if(qrImg) qrImg.src = res.imgData;
            if(qrStatus) qrStatus.innerText = "请扫码";
            startPolling(res.key);
        }
    });

    (window as any).closeModal = () => {
        if(loginModal) loginModal.style.display = 'none';
        if (pollTimer) clearInterval(pollTimer);
    };

    function startPolling(key: string) {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(async () => {
            const check = await window.api.checkLogin(key);
            if (check.status === 'success') {
                if (pollTimer) clearInterval(pollTimer);
                (window as any).closeModal();
                checkUserStatus();
                alert("登录成功！");
            }
        }, 3000);
    }

    window.api.onClipboardMatch((url) => {
        if (urlInput) {
            urlInput.value = url;
            if (logDiv) {
                logDiv.innerText += `\n>>> 🔗 捕获到普通链接，已自动填入！\n`;
                logDiv.scrollTop = logDiv.scrollHeight;
            }
        }
    });

    window.api.onSilentClipboardMatch((url) => {
        if (logDiv) {
            logDiv.innerText += `\n>>> 🤫 捕获到外部静默下载指令，已加入队列: ${url}\n`;
            logDiv.scrollTop = logDiv.scrollHeight;
        }
        
        downloadQueue.push({ url: url, isSilent: true });
        if (!isDownloading) {
            processQueue();
        }
    });

    downloadBtn?.addEventListener('click', () => {
        const rawText = urlInput?.value.trim();
        if (!rawText) return alert("请在上方输入框内粘贴链接");

        const urls = rawText.split(/[\s\n\r]+/).filter(u => u.length > 0);

        urls.forEach(url => {
            downloadQueue.push({ url: url, isSilent: false });
        });

        if (logDiv) {
            logDiv.innerText += `\n>>> 📥 成功切分！已将 ${urls.length} 个任务加入下载队列...\n`;
            logDiv.scrollTop = logDiv.scrollHeight;
        }

        if (urlInput) urlInput.value = '';

        if (!isDownloading) {
            processQueue();
        }
    });

    window.api.onProgress((data) => {
        if(!logDiv) return;
        
        if (data.includes('\r')) {
            const lines = logDiv.innerText.split('\n');
            const cleanData = data.replace(/\r/g, '').trim();
            if (cleanData) {
                lines[lines.length - 1] = cleanData;
                logDiv.innerText = lines.join('\n');
            }
        } else {
            logDiv.innerText += data;
        }

        if (logDiv.innerText.length > 15000) {
            logDiv.innerText = logDiv.innerText.substring(logDiv.innerText.length - 10000);
        }

        requestAnimationFrame(() => {
            logDiv.scrollTop = logDiv.scrollHeight;
        });
    });

    window.api.onComplete((code) => {
        if(logDiv) {
            logDiv.innerText += `\n====== 当前任务结束 (Code: ${code}) ======\n`;
            logDiv.scrollTop = logDiv.scrollHeight;
        }
        processQueue();
    });
});