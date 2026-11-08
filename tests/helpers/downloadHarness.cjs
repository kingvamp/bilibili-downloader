// 下载回归工具：直接加载主进程业务源码，用内存隔离网络、文件和子进程。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');

// 在隔离环境加载实际 TypeScript 源码，未声明的依赖禁止访问。
function loadSource(filename, dependencies, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, filename), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  vm.runInNewContext(code, {
    exports, console, TextDecoder, __dirname: path.dirname(path.join(root, filename)),
    process: { resourcesPath: 'mock-resources' },
    // 仅允许测试显式提供的依赖，防止真实网络和子进程操作。
    require: name => {
      assert.ok(Object.hasOwn(dependencies, name), `未模拟的依赖: ${name}`);
      return dependencies[name];
    },
    ...globals
  }, { filename });
  return exports;
}

// 建立实际 API 与下载器共用的测试环境，历史和请求均保存在内存中。
function createMainHarness(options = {}) {
  const requests = [];
  const logs = [];
  const progress = [];
  let history = '';
  let inFlight = 0;
  let maxInFlight = 0;
  let child;
  let resolveChild;
  let rejectChild;
  let processOptions;
  let result;
  let cookie = options.cookie ?? 'bili_jct=mock-token;';
  const fileMock = {
    readFileSync: () => history,
    promises: {
      writeFile: async (_name, content) => { history = content; }
    }
  };
  const dependencies = {
    electron: { app: { isPackaged: false }, clipboard: { writeText: () => {} } },
    path, fs: fileMock, qrcode: {},
    'fast-glob': options.glob ?? (async (_pattern, scanOptions) => {
      assert.equal(scanOptions.suppressErrors, undefined);
      assert.equal(scanOptions.caseSensitiveMatch, false);
      if (options.scanError) throw options.scanError;
      return options.files ?? [];
    }),
    './auth': {
      getCookie: () => cookie,
      setCookie: value => { cookie = value; },
      clearCookie: () => { cookie = ''; }
    },
    './settings': {
      getSettings: () => ({ downloadDir: options.downloadDir ?? 'mock-downloads', dlSub: false, multiThread: false }),
      getSetting: () => options.enabled ?? true
    },
    axios: {
      post: async (_url, body) => {
        requests.push(new URLSearchParams(body));
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        try {
          await options.beforePost?.(requests.at(-1), requests.length);
          if (options.networkError) throw new Error('模拟网络断开');
          return { status: 200, data: { code: options.businessCode ?? 0, message: '模拟业务拒绝' } };
        } finally { inFlight--; }
      }
    },
    './state': { state: {}, AppPaths: { historyPath: 'mock-history' } }
  };
  dependencies['./history'] = loadSource('src/main/history.ts', dependencies);
  const api = loadSource('src/main/api.ts', dependencies);
  const downloader = loadSource('src/main/downloader.ts', {
    ...dependencies, './api': api,
    './downloadProgress': loadSource('src/main/downloadProgress.ts', {}),
    execa: {
      execa: (_path, _args, spawnOptions) => {
        processOptions = spawnOptions;
        child = new Promise((resolve, reject) => { resolveChild = resolve; rejectChild = reject; });
        const childEvents = new EventEmitter();
        child.once = childEvents.once.bind(childEvents);
        child.emit = childEvents.emit.bind(childEvents);
        child.stdout = options.processError ? null : new EventEmitter();
        child.stderr = options.processError ? null : new EventEmitter();
        child.kill = () => {};
        return child;
      }
    }
  }, { Error });

  // 等待实际下载函数完成历史同步和取消收藏，再观察退出结果。
  async function download(exitCode = 0, aid = 170001, folderId = 123) {
    const execution = downloader.executeDownload({
      url: 'BV17x411w7KC', isSilent: false, aid, mediaId: folderId
    }, message => logs.push(message), value => progress.push(value));
    options.beforeExit?.(child);
    if (options.processError) rejectChild(options.processError);
    else resolveChild(options.processResult ?? { exitCode });
    if (!options.deferClose && !options.processError) child.emit('close', exitCode, null);
    result = await execution.promise;
    return result;
  }

  return {
    download, requests, logs, progress,
    get history() { return history; },
    get result() { return result; },
    get processOptions() { return processOptions; },
    get maxInFlight() { return maxInFlight; },
    remove: api.removeFromFavFolder,
    hasLog: text => logs.some(message => message.includes(text))
  };
}

// 用真实控制器持有流程，只模拟外部服务及可手动结算的下载进程。
function createManagerHarness(results, remove = async () => ({ success: true }), enabled = true, options = {}) {
  const { DownloadManager } = loadSource('src/main/downloadManager.ts', {});
  const removals = [];
  const starts = [];
  let lookups = 0;
  let scans = 0;
  let stops = 0;
  let currentDownload;
  let pendingConfirmation = null;
  const manager = new DownloadManager({
    getSettings: () => options.settings ? options.settings() : ({ unfavAfterDownload: enabled }),
    defaultFavoriteId: async () => {
      lookups++;
      return options.lookup ? options.lookup() : 123;
    },
    inspect: async url => {
      scans++;
      return typeof results === 'function' ? results(url) : results;
    },
    remove: async (aid, folderId) => {
      removals.push({ aid, folderId });
      return remove(aid, folderId);
    },
    collect: async (...args) => options.collect ? options.collect(...args) : ({ success: true }),
    download: task => {
      starts.push(task);
      currentDownload = createDeferred();
      return { promise: currentDownload.promise, cancel: () => { stops++; } };
    },
    waitBetweenFavoriteMutations: async () => {},
    confirmRedownload: (title, bvid) => {
      pendingConfirmation = { title, bvid, ...createDeferred() };
      options.onConfirmation?.();
      return pendingConfirmation.promise;
    },
    cancelConfirmation: () => {
      pendingConfirmation?.resolve(false);
      pendingConfirmation = null;
    },
    onState: () => {}, onLog: () => {}, onFinished: () => {}
  });
  return {
    manager, removals, starts,
    complete: async (code = 0) => { currentDownload.resolve(code); await settled(); },
    get status() { return manager.snapshot().state; },
    get logs() { return manager.snapshot().logs; },
    get confirmation() { return pendingConfirmation; },
    get lookups() { return lookups; },
    get scans() { return scans; },
    get stops() { return stops; }
  };
}

// 用确定的 Promise 屏障控制异步时序，避免依赖固定等待时间。
function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

// 等待当前异步调用链结算，不启动真实计时任务。
async function settled() {
  await new Promise(resolve => setImmediate(resolve));
}

// 加载真实调度器，将启动、唤醒、轮询和开关触发直接交给实际控制器。
function createSchedulerHarness(manager) {
  const powerEvents = new Map();
  const timers = [];
  const intervals = [];
  let enabled = false;
  let lastTriggeredTime = 0;
  let settingListener;
  const scheduler = loadSource('src/main/scheduler.ts', {
    electron: {
      ipcMain: { handle: () => {} },
      powerMonitor: { on: (name, callback) => powerEvents.set(name, callback) }
    },
    './settings': {
      getSetting: () => enabled,
      settingsStore: {
        onDidChange: (_key, listener) => { settingListener = listener; },
        set: (_key, value) => { lastTriggeredTime = value; },
        get: () => lastTriggeredTime
      }
    },
    './auth': { getCookie: () => 'bili_jct=mock;' },
    './downloadRuntime': { getDownloadManager: () => manager }
  }, {
    setTimeout: callback => { timers.push(callback); },
    setInterval: callback => { intervals.push(callback); }
  });
  scheduler.setupScheduler();
  return {
    enable: () => { const previous = enabled; enabled = true; settingListener(true, previous); },
    startup: () => timers[0](),
    wake: () => powerEvents.get('resume')(),
    tick: () => intervals[0]()
  };
}

module.exports = { loadSource, createMainHarness, createManagerHarness, createDeferred, createSchedulerHarness, settled };
