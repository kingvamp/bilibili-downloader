import { clipboard } from 'electron';
import { state } from './state';
import { getDownloadManager } from './downloadRuntime';
import { openClipboardWindow } from './window';
import { getSetting, settingsStore } from './settings';

let clipboardTimer: NodeJS.Timeout | null = null;

export function setupClipboard() {
  settingsStore.onDidChange('clipboardMonitor', enabled => {
    if (enabled) state.lastClipboardText = '';
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
          if (targetUrl) {
            console.log(`[Clipboard] Triggering silent download: ${targetUrl}`);
            getDownloadManager().startUrls([targetUrl], true);
          }
          return;
        }

        // Handle Normal Bilibili URL matching
        if (getSetting('clipboardMonitor')) {
          if (/bilibili\.com|b23\.tv/i.test(text)) {
            console.log('[Clipboard] Found matching URL, notifying renderer...');
            openClipboardWindow(text);
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
