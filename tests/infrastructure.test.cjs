// 基础设施回归：真实源码验证设置确认、认证清理、进程流和历史扫描边界。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const fg = require('fast-glob');
const { loadSource, createMainHarness, createRendererHarness, createDeferred } = require('./helpers/downloadHarness.cjs');

// 加载真实设置与认证模块，落盘可控，便于验证失败不改变权威值。
function createSettingsHarness() {
  const handlers = new Map();
  const stores = new Map();
  let failWrite = false;
  class MemoryStore {
    // 初始化独立命名存储。
    constructor(options) { this.store = { ...options.defaults }; stores.set(options.name, this); }
    // 读取单项权威值。
    get(key) { return this.store[key]; }
    // 模拟原子落盘及故障。
    set(key, value) {
      if (failWrite) throw new Error('模拟磁盘拒绝写入');
      this.store = { ...this.store, ...(typeof key === 'string' ? { [key]: value } : key) };
    }
  }
  const shared = loadSource('src/shared/settings.ts', {});
  const settings = loadSource('src/main/settings.ts', {
    electron: { ipcMain: { handle: (name, callback) => handlers.set(name, callback) } },
    'electron-store': MemoryStore,
    '../shared/settings': shared
  }, { console: { error: () => {} } });
  settings.setupSettings();
  const auth = loadSource('src/main/auth.ts', { 'electron-store': MemoryStore });
  return { settings, auth, stores, defaults: shared.DEFAULT_SETTINGS,
    save: value => handlers.get('save-settings')({}, value),
    failWrites: () => { failWrite = true; } };
}

test('设置保存失败保持原值，成功返回实际偏好，定时器状态不泄漏到偏好', () => {
  const harness = createSettingsHarness();
  const next = { ...harness.defaults, downloadDir: 'D:/videos', unfavAfterDownload: true };
  harness.stores.get('settings').set('lastTriggeredTime', 123);
  assert.equal(harness.save(next).success, true);
  assert.equal(harness.settings.getSetting('unfavAfterDownload'), true);
  assert.equal(harness.stores.get('settings').get('lastTriggeredTime'), 123);
  assert.equal(Object.hasOwn(harness.settings.getSettings(), 'lastTriggeredTime'), false);
  harness.failWrites();
  const result = harness.save({ ...next, downloadDir: 'E:/videos' });
  assert.equal(result.success, false);
  assert.match(result.message, /磁盘拒绝写入/);
  assert.equal(harness.settings.getSettings().downloadDir, 'D:/videos');
});

test('偏好 IPC 拒绝缺少字段、错误类型和伪造触发时间', () => {
  const harness = createSettingsHarness();
  for (const value of [null, [], {}, { ...harness.defaults, multiThread: 'true' },
    { ...harness.defaults, downloadDir: ' ' }, { ...harness.defaults, lastTriggeredTime: 999 }]) {
    assert.equal(harness.save(value).success, false);
  }
  assert.equal(harness.settings.getSetting('multiThread'), false);
  assert.equal(harness.stores.get('settings').get('lastTriggeredTime'), 0);
});

test('退出登录后 Cookie 仍为字符串，后续匹配不会调用 undefined.match', () => {
  const harness = createSettingsHarness();
  harness.auth.setCookie('bili_jct=test;');
  harness.auth.clearCookie();
  assert.equal(harness.auth.getCookie(), '');
  assert.equal(harness.auth.getCookie().match(/bili_jct/), null);
});

test('进程启动失败输出错误并结算 null，日志不泄漏 execa 命令中的 Cookie', async () => {
  const main = createMainHarness({ processResult: { code: 'ENOENT', failed: true,
    shortMessage: 'BBDown -c SECRET_COOKIE', exitCode: undefined } });
  await main.download();
  assert.equal(main.hasLog('ENOENT'), true);
  assert.equal(main.hasLog('SECRET_COOKIE'), false);
  assert.equal(main.messages.at(-1).value, null);
  assert.equal(main.requests.length, 0);
  assert.equal(main.processOptions.buffer, false);
  assert.equal(main.processOptions.windowsHide, true);
});

test('标准输出和错误输出交错的 GBK 多字节字符独立解码', async () => {
  const main = createMainHarness({ beforeExit: child => {
    child.stdout.emit('data', Buffer.from([0xc4]));
    child.stderr.emit('data', Buffer.from([0xba, 0xc3]));
    child.stdout.emit('data', Buffer.from([0xe3]));
  } });
  await main.download();
  assert.equal(main.hasLog('你'), true);
  assert.equal(main.hasLog('好'), true);
  assert.equal(main.hasLog('�'), false);
});

test('真实目录扫描包含大写扩展名和隐藏目录，不把父目录 BV 写入历史', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bili-infra-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const parent = path.join(dir, '.hidden', 'BV17x411w7KE');
  await fs.mkdir(parent, { recursive: true });
  await fs.writeFile(path.join(parent, 'movie [BV17x411w7KD].MP4'), 'test');
  const main = createMainHarness({ glob: fg, downloadDir: dir });
  await main.download(1);
  assert.ok(main.history.includes('BV17x411w7KD'));
  assert.equal(main.history.includes('BV17x411w7KE'), false);
});

test('默认收藏夹清理读取已保存偏好，早到的定时事件不使用旧 React 设置', async () => {
  const renderer = createRendererHarness([
    { bvid: 'BV17x411w7KC', aid: 170001, isDownloaded: true }
  ], undefined, false, { settings: () => ({ unfavAfterDownload: true }) });
  await renderer.scheduled();
  assert.equal(renderer.removals.length, 1);
});

test('读取设置期间停止保持执行权到读取返回，不再发起收藏夹查询', async () => {
  const gate = createDeferred();
  const renderer = createRendererHarness([], undefined, true, { settings: () => gate.promise });
  const running = renderer.run();
  renderer.hook.handleStop();
  await renderer.run();
  assert.equal(renderer.hook.isWorkflowBusy, true);
  assert.equal(renderer.lookups, 0);
  gate.resolve({ unfavAfterDownload: true });
  await running;
  assert.equal(renderer.lookups, 0);
  assert.equal(renderer.hook.isWorkflowBusy, false);
});

test('真实 execa 流消费超过默认缓冲上限仍正常结束', async () => {
  const { execa } = await import('execa');
  const bytes = 101 * 1024 * 1024;
  const child = execa(process.execPath, ['-e', `process.stdout.write(Buffer.alloc(${bytes}, 65))`],
    { reject: false, buffer: false, windowsHide: true });
  let received = 0;
  child.stdout.on('data', chunk => { received += chunk.length; });
  const result = await child;
  assert.equal(result.exitCode, 0);
  assert.equal(received, bytes);
});
