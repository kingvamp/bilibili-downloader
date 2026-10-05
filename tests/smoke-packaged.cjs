// 打包冒烟：用 Electron 加载 ASAR 内真实主进程和预加载，临时数据与隐藏窗口隔离用户环境。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { EventEmitter } = require('node:events');
const electron = require('electron');
const http = require('node:http');

if (!process.versions.electron) throw new Error('请使用 Electron 可执行文件运行此测试');
const packagedRoot = path.resolve(process.argv[2] ?? path.join(__dirname, '../release/win-unpacked'));
const resources = path.join(packagedRoot, 'resources');
const asar = path.join(resources, 'app.asar');
const scratch = path.resolve(process.argv[3]);
assert.equal(path.dirname(scratch), os.tmpdir());
const app = electron.app;
app.setPath('userData', scratch);
app.disableHardwareAcceleration();
process.resourcesPath = resources;
delete process.env.VITE_DEV_SERVER_URL;

// 沿用真实 BrowserWindow、渲染器和 preload，仅隐藏测试窗口。
class HiddenWindow extends electron.BrowserWindow {
  /** 创建不会打扰桌面的真实渲染窗口。 */
  constructor(options) { super({ ...options, show: false }); }
}
// 托盘外观不属于本次基础设施验证，避免向用户桌面添加临时图标。
class TestTray extends EventEmitter {
  /** 无需显示测试托盘提示。 */
  setToolTip() {}
  /** 无需显示测试托盘菜单。 */
  setContextMenu() {}
}
const proxyApp = new Proxy(app, {
  /** 用包内版本和打包标志执行真实应用代码，其余方法交给 Electron。 */
  get(target, key) {
    if (key === 'isPackaged') return true;
    if (key === 'getVersion') return () => require(path.join(asar, 'package.json')).version;
    const value = target[key];
    return typeof value === 'function' ? value.bind(target) : value;
  }
});
const originalLoad = Module._load;
const servers = [];
// 应用本地服务使用系统分配端口，避免占用已运行应用的固定端口。
Module._load = function load(request, parent, isMain) {
  if (request === 'electron') return { ...electron, app: proxyApp, BrowserWindow: HiddenWindow, Tray: TestTray };
  if (request === 'http') return { ...http, createServer: (...args) => {
    const server = http.createServer(...args);
    const listen = server.listen.bind(server);
    server.listen = (_port, ...rest) => listen(0, ...rest);
    servers.push(server);
    return server;
  } };
  return originalLoad.call(this, request, parent, isMain);
};

let finished = false;
/** 无论成功失败都销毁测试资源并返回准确退出码。 */
function finish(error) {
  if (finished) return;
  finished = true;
  clearTimeout(timeout);
  if (error) console.error('PACKAGED_SMOKE_FAILED', error);
  else console.log('PACKAGED_SMOKE_OK: ASAR main/preload/renderer/settings/auth');
  for (const server of servers) server.close();
  for (const window of electron.BrowserWindow.getAllWindows()) window.destroy();
  // 临时目录由父进程在 Electron 彻底退出、文件句柄释放后清理。
  app.exit(error ? 1 : 0);
}
const timeout = setTimeout(() => finish(new Error('打包冒烟在 30 秒内未完成')), 30_000);
process.on('uncaughtException', finish);
process.on('unhandledRejection', finish);
app.on('browser-window-created', (_event, window) => {
  window.webContents.on('render-process-gone', (_event, details) => finish(new Error(JSON.stringify(details))));
  window.webContents.once('did-finish-load', async () => {
    try {
      const result = await window.webContents.executeJavaScript(`(async () => {
        if (!document.querySelector('main')) throw new Error('主界面未挂载');
        const original = await window.api.getSettings();
        const next = { ...original, multiThread: true, notifyState: false };
        const saved = await window.api.saveSettings(next);
        const actual = await window.api.getSettings();
        const invalid = await window.api.saveSettings({ ...actual, multiThread: 'true' });
        await window.api.logout();
        const user = await window.api.getUserInfo();
        return { saved, actual, invalid, user };
      })()`);
      assert.equal(result.saved.success, true);
      assert.equal(result.actual.multiThread, true);
      assert.equal(result.actual.notifyState, false);
      assert.equal(result.invalid.success, false);
      assert.equal(result.user.isLogin, false);
      assert.equal(JSON.parse(fs.readFileSync(path.join(scratch, 'settings.json'), 'utf8')).multiThread, true);
      assert.equal(JSON.parse(fs.readFileSync(path.join(scratch, 'auth.json'), 'utf8')).sessionCookie, '');
      finish();
    } catch (error) { finish(error); }
  });
});

// 直接运行打包后的主进程，启动异常也必须让测试失败。
try { require(path.join(asar, 'dist-electron/main.js')); } catch (error) { finish(error); }
