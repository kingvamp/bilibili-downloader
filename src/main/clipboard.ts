import { clipboard, ipcMain } from 'electron';
import { state } from './state';

let clipboardTimer: NodeJS.Timeout | null = null;

export function setupClipboard() {
  ipcMain.on('set-clipboard-monitor', (event, s) => {
    state.isNormalClipboardMonitoring = s;
    if (s) state.lastClipboardText = '';
    console.log(`[Main] Clipboard monitoring set to: ${s}`);
  });

  // 1-second poll is efficient enough and avoids native dependency issues
  clipboardTimer = setInterval(() => {
    try {
      const text = clipboard.readText().trim();
      if (!text) return;

      if (text !== state.lastClipboardText) {
        state.lastClipboardText = text;
        console.log(`[Clipboard] Change detected: ${text.substring(0, 50)}...`);

        // Handle Silent Download Command
        if (text.startsWith('Enhancer_Download||')) {
          const targetUrl = text.split('||')[1]?.trim();
          if (targetUrl && state.mainWindow) {
            console.log(`[Clipboard] Triggering silent download: ${targetUrl}`);
            state.mainWindow.webContents.send('silent-clipboard-match', targetUrl);
          }
          return;
        }

        // Handle Normal Bilibili URL matching
        if (state.isNormalClipboardMonitoring) {
          if (/bilibili\.com|b23\.tv/i.test(text)) {
            if (state.mainWindow) {
              console.log(`[Clipboard] Found matching URL, notifying renderer...`);
              if (state.mainWindow.isMinimized()) state.mainWindow.restore();
              if (!state.mainWindow.isVisible()) state.mainWindow.show();
              state.mainWindow.focus();
              state.mainWindow.webContents.send('clipboard-match', text);
            }
          }
        }
      }
    } catch (e) {
      console.error('[Clipboard] Poll Error:', e);
    }
  }, 1000);
}

export function stopClipboard() {
  if (clipboardTimer) {
    clearInterval(clipboardTimer);
    clipboardTimer = null;
  }
}
