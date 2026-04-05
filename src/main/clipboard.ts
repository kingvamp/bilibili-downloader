import { clipboard, ipcMain } from 'electron';
import { state } from './state';
const clipboardListener = require('clipboard-event');

export function setupClipboard() {
  ipcMain.on('set-clipboard-monitor', (event, s) => {
    state.isNormalClipboardMonitoring = s;
    if (s) state.lastClipboardText = '';
  });

  clipboardListener.on('change', () => {
    const text = clipboard.readText().trim();
    
    if (text !== state.lastClipboardText && text !== '') {
        state.lastClipboardText = text;
        
        if (text.startsWith('Enhancer_Download||')) {
            const targetUrl = text.split('||')[1]?.trim();
            if (targetUrl && state.mainWindow) {
                state.mainWindow.webContents.send('silent-clipboard-match', targetUrl);
            }
            return; 
        }

        if (state.isNormalClipboardMonitoring) {
            if (/bilibili\.com|b23\.tv/i.test(text)) {
                if (state.mainWindow) {
                    if (state.mainWindow.isMinimized()) state.mainWindow.restore();
                    if (!state.mainWindow.isVisible()) state.mainWindow.show();
                    state.mainWindow.focus();
                    state.mainWindow.webContents.send('clipboard-match', text);
                }
            }
        }
    }
  });

  clipboardListener.startListening();
}

export function stopClipboard() {
  try {
      clipboardListener.stopListening();
  } catch (e) {}
}
