let electron = require("electron");
//#region src/preload.ts
electron.contextBridge.exposeInMainWorld("api", {
	startDownload: (url, isBatch = false, dlSub = false, downloadDir = "", isSilent = false, isMultiThread = false) => electron.ipcRenderer.send("start-download", url, isBatch, dlSub, downloadDir, isSilent, isMultiThread),
	onProgress: (callback) => {
		electron.ipcRenderer.removeAllListeners("download-progress");
		electron.ipcRenderer.on("download-progress", (_event, value) => callback(value));
	},
	onComplete: (callback) => {
		electron.ipcRenderer.removeAllListeners("download-complete");
		electron.ipcRenderer.on("download-complete", (_event, value) => callback(value));
	},
	getQRCode: () => electron.ipcRenderer.invoke("get-qrcode"),
	checkLogin: (key) => electron.ipcRenderer.invoke("check-login", key),
	getUserInfo: () => electron.ipcRenderer.invoke("get-user-info"),
	getDefaultFavId: () => electron.ipcRenderer.invoke("get-default-fav-id"),
	openExternal: (url) => electron.ipcRenderer.send("open-external", url),
	selectFolder: () => electron.ipcRenderer.invoke("select-folder"),
	setClipboardMonitor: (state) => electron.ipcRenderer.send("set-clipboard-monitor", state),
	setCloseToTray: (state) => electron.ipcRenderer.send("set-close-to-tray", state),
	setNotifyState: (state) => electron.ipcRenderer.send("set-notify-state", state),
	setSoundState: (state) => electron.ipcRenderer.send("set-sound-state", state),
	notifyQueueDone: () => electron.ipcRenderer.send("queue-finished"),
	onClipboardMatch: (callback) => {
		electron.ipcRenderer.removeAllListeners("clipboard-match");
		electron.ipcRenderer.on("clipboard-match", (_event, value) => callback(value));
	},
	onSilentClipboardMatch: (callback) => {
		electron.ipcRenderer.removeAllListeners("silent-clipboard-match");
		electron.ipcRenderer.on("silent-clipboard-match", (_event, value) => callback(value));
	},
	onOpenSettings: (callback) => {
		electron.ipcRenderer.removeAllListeners("open-settings");
		electron.ipcRenderer.on("open-settings", () => callback());
	},
	minWindow: () => electron.ipcRenderer.send("window-min"),
	maxWindow: () => electron.ipcRenderer.send("window-max"),
	closeWindow: () => electron.ipcRenderer.send("window-close")
});
//#endregion
