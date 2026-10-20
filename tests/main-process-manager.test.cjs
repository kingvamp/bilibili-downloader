// 主进程下载控制器回归：真实源码验证独占执行、后台无窗口、暂停、停止和清理竞态。
// 不使用 Electron/网络/BBDown；测试只注入所需的外部服务。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSource, createDeferred } = require('./helpers/downloadHarness.cjs');

const { DownloadManager } = loadSource('src/main/downloadManager.ts', {});
const a = { bvid: 'BV17x411w7KC', aid: 101, title: '一', isDownloaded: false };
const b = { bvid: 'BV17x411w7KD', aid: 102, title: '二', isDownloaded: false };

/** 构建全内存服务，执行结果和副作用全部可观察。 */
function harness(overrides = {}) {
  const runs = [];
  const logs = [];
  const states = [];
  const removals = [];
  const events = { finishes: 0, confirmations: 0, lookups: 0, inspections: 0 };
  const deps = {
    getSettings: () => ({unfavAfterDownload: true}),
    defaultFavoriteId: async () => { events.lookups++; return 123; },
    inspect: async () => { events.inspections++; return [a, b]; },
    download: (task, log) => {
      runs.push(task);
      log('下载中\n');
      return { promise: Promise.resolve(0), cancel: () => {} };
    },
    remove: async (aid, mediaId) => { removals.push({aid,mediaId}); return {success:true}; },
    collect: async () => ({success:true}),
    confirmRedownload: async () => { events.confirmations++; return false; },
    cancelConfirmation: () => {},
    onState: state => states.push(state),
    onLog: message => logs.push(message),
    onFinished: () => { events.finishes++; },
    ...overrides
  };
  const manager = new DownloadManager(deps);
  return {manager,runs,logs,states,removals,events};
}

/** 等待异步动作结算，不以真实计时作为业务依据。 */
async function settled() {
  await new Promise(resolve => setImmediate(resolve));
}

test('同一下载队列在主进程运行，完全不要求 BrowserWindow 或 React', async () => {
  const env = harness();
  assert.equal(env.manager.startDefaultFavorites(), true);
  assert.equal(env.manager.startDefaultFavorites(), false);
  assert.equal(env.manager.startUrls([b.bvid],true), false);
  await settled();
  assert.equal(env.events.lookups, 1);
  assert.equal(env.events.inspections, 1);
  assert.deepEqual(env.runs.map(x => x.url), [a.bvid,b.bvid]);
  assert.equal(env.events.finishes, 1);
  assert.equal(env.manager.snapshot().state.busy, false);
});

test('停止扫描等待在途查询，不入队也不产生完成通知', async () => {
  const gate = createDeferred();
  const env = harness({inspect: () => gate.promise});
  env.manager.startDefaultFavorites();
  await settled();
  env.manager.stop();
  assert.equal(env.manager.startUrls([b.bvid],true), false);
  gate.resolve([a,b]);
  await settled();
  assert.equal(env.manager.snapshot().state.busy, false);
  assert.equal(env.runs.length, 0);
  assert.equal(env.events.finishes, 0);
});

test('暂停时 BBDown 恰好成功，恢复不重复下载已完成任务', async () => {
  const gate = createDeferred();
  let canceled = 0;
  const env = harness({download: task => {
    env.runs.push(task);
    if (env.runs.length === 1) return {promise: gate.promise, cancel: () => canceled++};
    return {promise: Promise.resolve(0),cancel:()=>{}};
  }});
  env.manager.startDefaultFavorites();
  await settled();
  env.manager.pause();
  assert.equal(canceled, 1);
  gate.resolve(0);
  await settled();
  assert.equal(env.manager.snapshot().state.paused, true);
  assert.deepEqual(env.runs.map(x=>x.url),[a.bvid]);
  env.manager.resume();
  await settled();
  assert.deepEqual(env.runs.map(x=>x.url),[a.bvid,b.bvid]);
  assert.equal(env.events.finishes, 1);
});

test('暂停时 BBDown 失败则原任务留队，恢复后重新执行', async () => {
  const gate = createDeferred();
  const env = harness({ download: task => {
    env.runs.push(task);
    return {promise: env.runs.length === 1 ? gate.promise : Promise.resolve(0),cancel:()=>{}};
  }});
  env.manager.startUrls([a.bvid],true);
  await settled();
  env.manager.pause();
  gate.resolve(null);
  await settled();
  assert.equal(env.manager.snapshot().state.paused,true);
  assert.equal(env.runs.length,1);
  env.manager.resume();
  await settled();
  assert.deepEqual(env.runs.map(x=>x.url),[a.bvid,a.bvid]);
});

test('移除已下载条目时停止，等待当前请求结束但不继续下一条', async () => {
  const gate = createDeferred();
  const entered = createDeferred();
  let calls=0;
  const env = harness({
    inspect: async () => [
      {...a,isDownloaded:true},
      {...b,isDownloaded:true},
      {bvid:'BV1x2ynBmEC2',aid:103,title:'新',isDownloaded:false}
    ],
    remove: async () => { calls++; entered.resolve(); return gate.promise; }
  });
  env.manager.startDefaultFavorites();
  await entered.promise;
  env.manager.stop();
  assert.equal(env.manager.startUrls([a.bvid],true),false);
  gate.resolve({success:true});
  await settled();
  assert.equal(calls,1);
  assert.equal(env.runs.length,0);
  assert.equal(env.manager.snapshot().state.busy,false);
});

test('主进程快照在 UI 重新挂载时提供正在运行的队列状态', async () => {
  const gate = createDeferred();
  const env = harness({download: task => {
    env.runs.push(task);
    return {promise:gate.promise,cancel:()=>{}};
  }});
  env.manager.startUrls([a.bvid],true);
  await settled();
  const snapshot = env.manager.snapshot();
  assert.equal(snapshot.state.busy,true);
  assert.equal(snapshot.state.downloading,true);
  assert.equal(snapshot.state.total,1);
  assert.ok(snapshot.logs.includes(a.bvid));
  gate.resolve(0);
  await settled();
  assert.equal(env.manager.snapshot().state.busy,false);
});
