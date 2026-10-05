// 取消收藏回归测试：直接加载主进程和下载 Hook 源码，用内存模拟 IPC、网络和文件系统。
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
  const handlers = new Map();
  const requests = [];
  const messages = [];
  let history = '';
  let inFlight = 0;
  let maxInFlight = 0;
  let child;
  let resolveChild;
  let finished;
  let processOptions;
  const state = {
    currentChild: null,
    unfavAfterDownload: options.enabled ?? true,
    sessionCookie: options.cookie ?? 'bili_jct=mock-token;'
  };
  const fileMock = {
    existsSync: name => name === 'mock-downloads',
    readFileSync: () => history,
    promises: {
      readdir: async () => [],
      readFile: async () => history,
      writeFile: async (_name, content) => { history = content; }
    }
  };
  const electron = {
    app: { isPackaged: false },
    ipcMain: {
      on: (name, callback) => handlers.set(name, callback),
      handle: (name, callback) => handlers.set(name, callback)
    },
    clipboard: { writeText: () => {} }
  };
  const dependencies = {
    electron, path, fs: fileMock, qrcode: {},
    'fast-glob': async (_pattern, scanOptions) => {
      if (scanOptions.suppressErrors) throw new Error('不允许隐藏扫描错误');
      if (options.scanError) throw options.scanError;
      return options.files ?? [];
    },
    './auth': {
      getCookie: () => state.sessionCookie,
      setCookie: cookie => { state.sessionCookie = cookie; },
      clearCookie: () => { state.sessionCookie = ''; }
    },
    './settings': {
      getSettings: () => ({ downloadDir: options.downloadDir ?? 'mock-downloads', dlSub: false, multiThread: false }),
      getSetting: () => state.unfavAfterDownload
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
    './state': { state, AppPaths: { cookiePath: 'mock-cookie', historyPath: 'mock-history' } }
  };
  const api = loadSource('src/main/api.ts', dependencies);
  api.setupApi();
  loadSource('src/main/downloader.ts', {
    ...dependencies, './api': api,
    'fast-glob': options.glob ?? (async (_pattern, scanOptions) => {
      assert.equal(scanOptions.suppressErrors, undefined);
      assert.equal(scanOptions.caseSensitiveMatch, false);
      if (options.scanError) throw options.scanError;
      return options.files ?? [];
    }),
    execa: {
      execa: (_path, _args, spawnOptions) => {
        processOptions = spawnOptions;
        child = new Promise(resolve => { resolveChild = resolve; });
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.kill = () => {};
        return child;
      }
    }
  }).setupDownloader();

  // 运行单视频下载的完整退出回调，涵盖历史写入、取消收藏和完成通知。
  async function download(exitCode = 0, aid = 170001, folderId = 123) {
    finished = createDeferred();
    handlers.get('start-download')(
      { sender: { send: (channel, value) => {
        messages.push({ channel, value });
        if (channel === 'download-complete') finished.resolve();
      } } },
      'BV17x411w7KC', false, false, aid, folderId
    );
    options.beforeExit?.(child);
    resolveChild(options.processResult ?? { exitCode });
    await finished.promise;
  }

  return {
    download, requests, messages,
    get history() { return history; },
    get processOptions() { return processOptions; },
    get maxInFlight() { return maxInFlight; },
    remove: (aid, folderId) => handlers.get('remove-from-fav-folder')({}, aid, folderId),
    hasLog: text => messages.some(item => typeof item.value === 'string' && item.value.includes(text))
  };
}

// 建立 Hook 的状态环境，并通过默认收藏夹入口执行共享的扫描和入队逻辑。
function createRendererHarness(results, remove = async () => ({ success: true }), enabled = true, options = {}) {
  const states = [];
  const refs = [];
  const removals = [];
  const starts = [];
  const listeners = {};
  let stateIndex = 0;
  let refIndex = 0;
  let effects = [];
  let lookups = 0;
  let scans = 0;
  let stops = 0;
  const react = {
    useState: initial => {
      const index = stateIndex++;
      const slot = states[index] ?? (states[index] = { value: initial });
      return [slot.value, updater => {
        slot.value = typeof updater === 'function' ? updater(slot.value) : updater;
        options.onStateChange?.(slot.value);
      }];
    },
    useRef: initial => {
      const index = refIndex++;
      return refs[index] ?? (refs[index] = { current: initial });
    },
    useEffect: callback => { effects.push(callback); },
    useCallback: callback => callback
  };
  const globals = {
    window: { confirm: () => true, api: {
      getSettings: async () => options.settings ? options.settings() : ({ unfavAfterDownload: enabled }),
      getDefaultFavId: async () => {
        lookups++;
        return options.lookup ? options.lookup() : 123;
      },
      checkDownloadHistory: async url => {
        scans++;
        return typeof results === 'function' ? results(url) : results;
      },
      removeFromFavFolder: async (aid, folderId) => {
        removals.push({ aid, folderId });
        return remove(aid, folderId);
      },
      collectToFavFolder: async (...args) => options.collect ? options.collect(...args) : ({ success: true }),
      startDownload: (...args) => { starts.push(args); },
      stopDownload: () => { stops++; },
      notifyQueueDone: () => {},
      onProgress: callback => { listeners.progress = callback; },
      onComplete: callback => { listeners.complete = callback; },
      onClipboardMatch: callback => { listeners.clipboard = callback; },
      onSilentClipboardMatch: callback => { listeners.silent = callback; },
      onScheduledFavDownload: callback => { listeners.scheduled = callback; }
    } },
    alert: message => { throw new Error(message); },
    // 测试立即执行原有节流定时器，避免等待且不改变业务结果。
    setTimeout: callback => { callback(); return 0; }
  };
  const workflow = loadSource('src/renderer/utils/downloadWorkflow.ts', {});
  const favorites = loadSource('src/renderer/utils/defaultFavorites.ts', {}, globals);
  const { useDownload } = loadSource('src/renderer/hooks/useDownload.ts', {
    react, '../utils/bilibili': {}, '../utils/downloadWorkflow': workflow, '../utils/defaultFavorites': favorites
  }, globals);

  // 按稳定的 Hook 槽位重新渲染，模拟 state 与 ref 的不同更新时间。
  function render() {
    stateIndex = 0;
    refIndex = 0;
    effects = [];
    return useDownload({ unfavAfterDownload: enabled });
  }

  // 显式提交 effect，让测试控制队列启动以及重复 effect 的时序。
  function flush() {
    render();
    const pending = effects.slice();
    const queueEffect = pending.find(callback => callback.toString().includes('startDownload'));
    pending.forEach(callback => callback());
    render();
    return queueEffect;
  }
  flush();
  return {
    run: () => render().handleDownloadDefaultFav(), removals, starts, flush,
    scheduled: () => listeners.scheduled(null),
    silent: url => listeners.silent(url),
    complete: (code = 0) => { listeners.complete(code); flush(); },
    get hook() { return render(); },
    get logs() { return states[0].value; },
    get queue() { return states[4].value; },
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

// 加载真实定时器，捕获启动、唤醒、轮询和开关触发，不执行真实计时或网络。
function createSchedulerHarness(trigger) {
  const handlers = new Map();
  const powerEvents = new Map();
  const timers = [];
  const intervals = [];
  const pending = [];
  let enabled = false;
  let lastTriggeredTime = 0;
  let settingListener;
  const scheduler = loadSource('src/main/scheduler.ts', {
    electron: {
      app: { getPath: () => 'mock-user' },
      ipcMain: { on: (name, callback) => handlers.set(name, callback), handle: (name, callback) => handlers.set(name, callback) },
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
    './state': { state: {
      mainWindow: { webContents: { send: (channel, message) => {
        assert.equal(channel, 'scheduled-fav-download');
        pending.push(trigger(message));
      } } }
    } }
  }, {
    // 调度器日志不影响断言，只保留异常以便定位。
    console: { log: () => {}, warn: console.warn, error: console.error },
    setTimeout: callback => { timers.push(callback); },
    setInterval: callback => { intervals.push(callback); }
  });
  scheduler.setupScheduler();
  return {
    enable: () => { const previous = enabled; enabled = true; settingListener(true, previous); },
    startup: () => timers[0](),
    wake: () => powerEvents.get('resume')(),
    tick: () => intervals[0](),
    finish: () => Promise.all(pending)
  };
}

module.exports = { loadSource, createMainHarness, createRendererHarness, createDeferred, createSchedulerHarness };
