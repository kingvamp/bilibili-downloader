// 取消收藏回归测试：直接加载主进程和下载 Hook 源码，用内存模拟 IPC、网络和文件系统。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

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
  let child;
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
    axios: {
      post: async (_url, body) => {
        requests.push(new URLSearchParams(body));
        if (options.networkError) throw new Error('模拟网络断开');
        return { status: 200, data: { code: options.businessCode ?? 0, message: '模拟业务拒绝' } };
      }
    },
    './state': { state, AppPaths: { cookiePath: 'mock-cookie', historyPath: 'mock-history' } }
  };
  const api = loadSource('src/main/api.ts', dependencies);
  api.setupApi();
  loadSource('src/main/downloader.ts', {
    ...dependencies, './api': api,
    child_process: {
      spawn: () => {
        child = new EventEmitter();
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.kill = () => {};
        return child;
      }
    }
  }).setupDownloader();

  // 运行单视频下载的完整退出回调，涵盖历史写入、取消收藏和完成通知。
  async function download(exitCode = 0, aid = 170001, folderId = 123) {
    handlers.get('start-download')(
      { sender: { send: (channel, value) => messages.push({ channel, value }) } },
      'BV17x411w7KC', false, false, 'mock-downloads', false, false, aid, folderId
    );
    await child.listeners('close')[0](exitCode);
  }

  return {
    download, requests, messages,
    get history() { return history; },
    remove: (aid, folderId) => handlers.get('remove-from-fav-folder')({}, aid, folderId),
    hasLog: text => messages.some(item => typeof item.value === 'string' && item.value.includes(text))
  };
}

// 建立 Hook 的状态环境，并通过默认收藏夹入口执行共享的扫描和入队逻辑。
function createRendererHarness(results, remove = async () => ({ success: true }), enabled = true) {
  const states = [];
  const removals = [];
  const react = {
    useState: initial => {
      const slot = { value: initial };
      states.push(slot);
      return [slot.value, updater => {
        slot.value = typeof updater === 'function' ? updater(slot.value) : updater;
      }];
    },
    useRef: initial => ({ current: initial }),
    useEffect: () => {},
    useCallback: callback => callback
  };
  const { useDownload } = loadSource('src/renderer/hooks/useDownload.ts', { react, '../utils/bilibili': {} }, {
    window: { api: {
      getDefaultFavId: async () => 123,
      checkDownloadHistory: async () => results,
      removeFromFavFolder: async (aid, folderId) => {
        removals.push({ aid, folderId });
        return remove(aid, folderId);
      }
    } },
    // 测试立即执行原有节流定时器，避免等待且不改变业务结果。
    setTimeout: callback => { callback(); return 0; }
  });
  const hook = useDownload({ unfavAfterDownload: enabled });
  return {
    run: hook.handleDownloadDefaultFav, removals,
    get logs() { return states[0].value; },
    get queue() { return states[4].value; }
  };
}

const oldVideo = { bvid: 'BV17x411w7KC', aid: 170001, title: '已下载视频', isDownloaded: true };
const newVideo = { bvid: 'BV1x2ynBmEC2', aid: 170002, title: '未下载视频', isDownloaded: false };

test('下载成功且业务成功时取消收藏，并写入历史和完成通知', async () => {
  const main = createMainHarness();
  await main.download();
  assert.equal(main.requests.length, 1);
  assert.equal(main.requests[0].get('rid'), '170001');
  assert.equal(main.requests[0].get('del_media_ids'), '123');
  assert.equal(main.requests[0].get('add_media_ids'), '');
  assert.equal(main.hasLog('已从收藏夹移除'), true);
  assert.ok(main.history.includes(oldVideo.bvid));
  assert.equal(main.messages.at(-1).channel, 'download-complete');
  assert.equal(main.messages.at(-1).value, 0);
});

test('HTTP 200 业务失败不报移除成功，记录错误码并继续下载队列', async () => {
  const main = createMainHarness({ businessCode: -101 });
  await main.download();
  assert.equal(main.hasLog('已从收藏夹移除'), false);
  assert.equal(main.hasLog('取消收藏失败'), true);
  assert.equal(main.hasLog('code: -101'), true);
  assert.ok(main.history.includes(oldVideo.bvid));
  assert.equal(main.messages.at(-1).value, 0);
});

test('取消收藏网络失败仍发送下载完成通知', async () => {
  const main = createMainHarness({ networkError: true });
  await main.download();
  assert.equal(main.hasLog('模拟网络断开'), true);
  assert.equal(main.hasLog('已从收藏夹移除'), false);
  assert.equal(main.messages.at(-1).channel, 'download-complete');
});

for (const [label, cookie, message] of [
  ['未登录', '', '请先登录'],
  ['缺少 CSRF', 'SESSDATA=mock-session;', '未找到 CSRF']
]) {
  test(`${label}时明确报告取消收藏失败`, async () => {
    const main = createMainHarness({ cookie });
    await main.download();
    assert.equal(main.requests.length, 0);
    assert.equal(main.hasLog(message), true);
    assert.equal(main.hasLog('已从收藏夹移除'), false);
    assert.equal(main.messages.at(-1).channel, 'download-complete');
  });
}

for (const exitCode of [1, null]) {
  test(`下载退出码 ${exitCode} 时不取消收藏`, async () => {
    const main = createMainHarness();
    await main.download(exitCode);
    assert.equal(main.requests.length, 0);
    assert.equal(main.hasLog('已从收藏夹移除'), false);
  });
}

test('关闭开关时下载成功也不取消收藏', async () => {
  const main = createMainHarness({ enabled: false });
  await main.download();
  assert.equal(main.requests.length, 0);
});

test('IPC 清理路径同样校验业务错误码', async () => {
  const main = createMainHarness({ businessCode: -111 });
  const result = await main.remove(170001, 123);
  assert.equal(result.success, false);
  assert.ok(result.message.includes('code: -111'));
});

test('新旧混合时只清理已下载条目，新视频携带收藏信息入队', async () => {
  const renderer = createRendererHarness([oldVideo, newVideo]);
  await renderer.run();
  assert.equal(renderer.removals.length, 1);
  assert.equal(renderer.removals[0].aid, oldVideo.aid);
  assert.equal(renderer.queue.length, 1);
  assert.equal(renderer.queue[0].url, newVideo.bvid);
  assert.equal(renderer.queue[0].aid, newVideo.aid);
  assert.equal(renderer.queue[0].mediaId, 123);
});

test('全部已下载时清理收藏且不建立下载任务', async () => {
  const renderer = createRendererHarness([oldVideo]);
  await renderer.run();
  assert.equal(renderer.removals.length, 1);
  assert.equal(renderer.queue.length, 0);
});

test('全部未下载时只入队，下载完成前不取消收藏', async () => {
  const renderer = createRendererHarness([newVideo]);
  await renderer.run();
  assert.equal(renderer.removals.length, 0);
  assert.equal(renderer.queue.length, 1);
});

test('关闭开关时扫描不清理历史条目', async () => {
  const renderer = createRendererHarness([oldVideo, newVideo], undefined, false);
  await renderer.run();
  assert.equal(renderer.removals.length, 0);
  assert.equal(renderer.queue.length, 1);
});

test('清理失败和缺少 AID 都有日志，仍继续新视频入队', async () => {
  const noAid = { ...oldVideo, bvid: 'BV17x411w7KD', aid: undefined };
  const renderer = createRendererHarness([oldVideo, noAid, newVideo], async () => ({ success: false, message: '模拟拒绝' }));
  await renderer.run();
  assert.equal(renderer.removals.length, 1);
  assert.ok(renderer.logs.includes('模拟拒绝'));
  assert.ok(renderer.logs.includes('未能获取到 AID'));
  assert.equal(renderer.queue.length, 1);
});

test('移除失败后的历史条目，在下一次混合扫描中再次处理', async () => {
  const options = { businessCode: -101 };
  const main = createMainHarness(options);
  await main.download();
  assert.equal(main.hasLog('已从收藏夹移除'), false);
  options.businessCode = 0;
  const renderer = createRendererHarness([
    { ...oldVideo, isDownloaded: main.history.includes(oldVideo.bvid) }, newVideo
  ], main.remove);
  await renderer.run();
  assert.equal(main.requests.length, 2);
  assert.equal(renderer.removals[0].aid, oldVideo.aid);
  assert.ok(renderer.logs.includes('已取消收藏'));
  assert.equal(renderer.queue[0].url, newVideo.bvid);
});
