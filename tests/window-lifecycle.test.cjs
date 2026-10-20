// 托盘窗口生命周期回归：验证关闭释放窗口、后台不退出、重建窗口时恢复 UI 意图。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { loadSource } = require('./helpers/downloadHarness.cjs');

/** 用真实 window.ts 和最小 Electron 对象验证生命周期，无需启动 Chromium。 */
function createHarness() {
  const events = new Map(), handlers = new Map(), windows = [];
  const app = new EventEmitter();
  let quits = 0, menu;
  app.quit = () => { quits++; };
  const state = { mainWindow: null, tray: null, isQuitting: false };
  let closeToTray = true, canceledConfirmation = 0;
  class MockWindow extends EventEmitter {
    constructor() {
      super();
      this.webContents = {
        send: (...args) => this.messages.push(args),
        isLoading: () => this.loading,
        isDestroyed: () => false
      };
      this.loading = false;
      this.messages = [];
      this.visible = true;
      windows.push(this);
    }
    loadFile() {}
    loadURL() {}
    isDestroyed() { return this.destroyed === true; }
    isMinimized() { return false; }
    isMaximized() { return false; }
    maximize() {}
    unmaximize() {}
    restore() {}
    show() { this.visible = true; }
    hide() { this.visible = false; }
    focus() {}
    flashFrame() {}
    close() { this.destroyed = true; this.emit('closed'); app.emit('window-all-closed'); }
  }
  class MockTray extends EventEmitter {
    setToolTip() {}
    setContextMenu(value) { menu = value; }
  }
  const windowModule = loadSource('src/main/window.ts', {
    electron: {
      app, BrowserWindow: MockWindow, Tray: MockTray,
      Menu: {buildFromTemplate: value => value},
      shell: {openExternal() {}},
      dialog: {showOpenDialog: async () => ({canceled:true,filePaths:[]})},
      ipcMain: {on: (event, callback) => events.set(event,callback), handle: (event,callback) => handlers.set(event,callback)}
    },
    path, './state': {state},
    './settings': {getSetting: () => closeToTray},
    './downloadRuntime': {cancelPendingConfirmation: () => canceledConfirmation++}
  }, {process: {env:{},resourcesPath:'mock'}});
  windowModule.setupWindow();
  return {
    state,windows,events,handlers,windowModule,
    get menu() {return menu;},
    get quits() {return quits;},
    get canceled() {return canceledConfirmation;},
    disableTray: () => {closeToTray=false;}
  };
}

test('关闭到托盘释放原窗口但不退出；重新点击托盘可以重建窗口', () => {
  const h=createHarness();
  const first=h.state.mainWindow;
  assert.ok(first);
  h.events.get('window-close')();
  assert.equal(h.state.mainWindow,null);
  assert.equal(h.quits,0);
  assert.equal(h.canceled,1);
  assert.ok(h.state.tray);
  h.menu[0].click();
  assert.notEqual(h.state.mainWindow,first);
  assert.equal(h.windows.length,2);
});

test('窗口重建后消费剪贴板和设置意图，不丢失异步初始化期间的事件', () => {
  const h=createHarness();
  h.events.get('window-close')();
  h.windowModule.openClipboardWindow('https://www.bilibili.com/video/BV17x411w7KC');
  let intents=h.handlers.get('consume-ui-intents')();
  assert.equal(intents.clipboardUrl,'https://www.bilibili.com/video/BV17x411w7KC');
  assert.equal(h.handlers.get('consume-ui-intents')().clipboardUrl,null);
  h.events.get('window-close')();
  h.menu[1].click();
  intents=h.handlers.get('consume-ui-intents')();
  assert.equal(intents.openSettings,true);
  assert.equal(h.handlers.get('consume-ui-intents')().openSettings,false);
});

test('关闭到托盘开关关闭时，最后窗口关闭触发应用退出', () => {
  const h=createHarness();
  h.disableTray();
  h.events.get('window-close')();
  assert.equal(h.quits,1);
});
