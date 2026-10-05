// 下载流程互斥回归：通过真实 Hook 和 API 验证入口重入、队列、暂停、停止与串行请求。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createMainHarness, createRendererHarness, createDeferred, createSchedulerHarness } = require('./helpers/downloadHarness.cjs');

const oldVideo = { bvid: 'BV17x411w7KC', aid: 170001, title: '已下载视频', isDownloaded: true };
const newVideo = { bvid: 'BV1x2ynBmEC2', aid: 170002, title: '新视频', isDownloaded: false };
const nextVideo = { ...newVideo, bvid: 'BV1x2ynBmEC3', aid: 170003 };

test('同一时刻重复手动触发只查询、扫描和取消收藏一次', async () => {
  const renderer = createRendererHarness([oldVideo]);
  await Promise.all([renderer.run(), renderer.run()]);
  assert.equal(renderer.lookups, 1);
  assert.equal(renderer.scans, 1);
  assert.equal(renderer.removals.length, 1);
  assert.equal(renderer.hook.isWorkflowBusy, false);
});

test('查询默认收藏夹期间阻止定时触发与静默剪贴板入队', async () => {
  const gate = createDeferred();
  const renderer = createRendererHarness([oldVideo], undefined, true, { lookup: () => gate.promise });
  const running = renderer.run();
  await renderer.scheduled();
  await renderer.silent(newVideo.bvid);
  assert.equal(renderer.lookups, 1);
  assert.equal(renderer.scans, 0);
  assert.equal(renderer.queue.length, 0);
  gate.resolve(123);
  await running;
  assert.equal(renderer.scans, 1);
  assert.equal(renderer.removals.length, 1);
});

test('定时扫描占用期间阻止手动流程', async () => {
  const gate = createDeferred();
  const entered = createDeferred();
  const renderer = createRendererHarness(() => { entered.resolve(); return gate.promise; });
  const running = renderer.scheduled();
  await entered.promise;
  await renderer.run();
  assert.equal(renderer.scans, 1);
  assert.equal(renderer.lookups, 1);
  gate.resolve([oldVideo]);
  await running;
  assert.equal(renderer.removals.length, 1);
});

test('普通下载队列阻止默认收藏夹和新的普通下载入口', async () => {
  const renderer = createRendererHarness([]);
  await renderer.hook.checkAndAddTasks([newVideo.bvid], true);
  await renderer.run();
  await renderer.hook.checkAndAddTasks([nextVideo.bvid], true);
  assert.equal(renderer.lookups, 0);
  assert.equal(renderer.queue.length, 1);
  assert.equal(renderer.hook.isWorkflowBusy, true);
  renderer.flush();
  renderer.complete();
  assert.equal(renderer.hook.isWorkflowBusy, false);
});

test('扫描结束后保留占用到整个队列完成，重复 effect 不启动第二个下载', async () => {
  const renderer = createRendererHarness([newVideo, nextVideo]);
  await renderer.run();
  await renderer.run();
  assert.equal(renderer.lookups, 1);
  assert.equal(renderer.hook.isWorkflowBusy, true);
  const replay = renderer.flush();
  replay();
  assert.equal(renderer.starts.length, 1);
  assert.equal(renderer.queue.length, 1);
  renderer.complete();
  assert.equal(renderer.starts.length, 2);
  assert.equal(renderer.hook.isWorkflowBusy, true);
  await renderer.scheduled();
  assert.equal(renderer.lookups, 1);
  renderer.complete();
  assert.equal(renderer.hook.isWorkflowBusy, false);
  await renderer.run();
  assert.equal(renderer.lookups, 2);
});

test('暂停保留占用，旧子进程结束前不能恢复或启动其他流程', async () => {
  const renderer = createRendererHarness([newVideo, nextVideo]);
  await renderer.run();
  renderer.flush();
  renderer.hook.handlePause();
  renderer.hook.handleResume();
  renderer.flush();
  await renderer.run();
  assert.equal(renderer.stops, 1);
  assert.equal(renderer.starts.length, 1);
  assert.equal(renderer.lookups, 1);
  assert.equal(renderer.hook.isPaused, true);
  renderer.complete(null);
  assert.equal(renderer.hook.isWorkflowBusy, true);
  assert.equal(renderer.starts.length, 1);
  renderer.hook.handleResume();
  renderer.flush();
  assert.equal(renderer.starts.length, 2);
  renderer.complete();
  assert.equal(renderer.starts.length, 3);
  renderer.complete();
  assert.equal(renderer.hook.isWorkflowBusy, false);
});

test('停止下载后等待在途任务完成，不启动剩余任务或新流程', async () => {
  const renderer = createRendererHarness([newVideo, nextVideo]);
  await renderer.run();
  renderer.flush();
  renderer.hook.handleStop();
  await renderer.run();
  assert.equal(renderer.hook.isWorkflowBusy, true);
  assert.equal(renderer.lookups, 1);
  assert.equal(renderer.queue.length, 0);
  renderer.complete(null);
  assert.equal(renderer.starts.length, 1);
  assert.equal(renderer.hook.isWorkflowBusy, false);
  assert.equal(renderer.hook.completedTasks, 0);
  await renderer.run();
  assert.equal(renderer.lookups, 2);
});

test('查询期间停止要等查询返回，且不继续扫描或入队', async () => {
  const gate = createDeferred();
  const entered = createDeferred();
  const renderer = createRendererHarness([newVideo], undefined, true, { lookup: () => { entered.resolve(); return gate.promise; } });
  const running = renderer.run();
  await entered.promise;
  renderer.hook.handleStop();
  await renderer.run();
  assert.equal(renderer.hook.isWorkflowBusy, true);
  assert.equal(renderer.lookups, 1);
  gate.resolve(123);
  await running;
  assert.equal(renderer.scans, 0);
  assert.equal(renderer.queue.length, 0);
  assert.equal(renderer.hook.isWorkflowBusy, false);
});

test('清理期间停止只等待当前取消收藏，不继续下一条或下载入队', async () => {
  const gate = createDeferred();
  const entered = createDeferred();
  const renderer = createRendererHarness([oldVideo, { ...oldVideo, aid: 170004 }, newVideo], () => {
    entered.resolve();
    return gate.promise;
  });
  const running = renderer.run();
  await entered.promise;
  renderer.hook.handleStop();
  await renderer.scheduled();
  assert.equal(renderer.hook.isWorkflowBusy, true);
  assert.equal(renderer.removals.length, 1);
  gate.resolve({ success: true });
  await running;
  assert.equal(renderer.removals.length, 1);
  assert.equal(renderer.queue.length, 0);
  assert.equal(renderer.hook.isWorkflowBusy, false);
});

test('扫描抛错后释放执行权，后续流程仍可启动', async () => {
  let fail = true;
  const renderer = createRendererHarness(() => {
    if (fail) throw new Error('模拟扫描失败');
    return [];
  });
  await renderer.run();
  assert.ok(renderer.logs.includes('模拟扫描失败'));
  assert.equal(renderer.hook.isWorkflowBusy, false);
  fail = false;
  await renderer.run();
  assert.equal(renderer.lookups, 2);
  assert.equal(renderer.hook.isWorkflowBusy, false);
});

test('IPC 清理与下载完成的取消收藏共用主进程串行队列', async () => {
  const gate = createDeferred();
  const entered = createDeferred();
  const main = createMainHarness({ beforePost: async (_request, count) => {
    if (count === 1) { entered.resolve(); await gate.promise; }
  } });
  const cleanup = main.remove(170004, 123);
  await entered.promise;
  const download = main.download();
  assert.equal(main.requests.length, 1);
  gate.resolve();
  await Promise.all([cleanup, download]);
  assert.equal(main.maxInFlight, 1);
  assert.deepEqual(main.requests.map(request => request.get('rid')), ['170004', '170001']);
  assert.equal(main.messages.at(-1).channel, 'download-complete');
});

test('某次 HTTP 412 失败不会中断串行队列或并行发送后续请求', async () => {
  const main = createMainHarness({ beforePost: async (_request, count) => {
    if (count === 1) throw new Error('Request failed with status code 412');
  } });
  const [first, second] = await Promise.all([main.remove(170004, 123), main.remove(170005, 123)]);
  assert.equal(first.success, false);
  assert.ok(first.message.includes('412'));
  assert.equal(second.success, true);
  assert.equal(main.maxInFlight, 1);
});

test('暂停恰逢任务成功时结算已完成任务，恢复不重复下载', async () => {
  const renderer = createRendererHarness([newVideo, nextVideo]);
  await renderer.run();
  renderer.flush();
  renderer.hook.handlePause();
  renderer.complete(0);
  assert.equal(renderer.hook.isPaused, true);
  assert.equal(renderer.hook.isWorkflowBusy, true);
  assert.equal(renderer.hook.completedTasks, 1);
  renderer.hook.handleResume();
  renderer.flush();
  assert.equal(renderer.starts.length, 2);
  assert.equal(renderer.starts[1][0], nextVideo.bvid);
  renderer.complete();
  assert.equal(renderer.hook.isWorkflowBusy, false);
});

test('暂停恰逢最后一个任务成功时释放流程并清除暂停状态', async () => {
  const renderer = createRendererHarness([newVideo]);
  await renderer.run();
  renderer.flush();
  renderer.hook.handlePause();
  renderer.complete(0);
  assert.equal(renderer.hook.isWorkflowBusy, false);
  assert.equal(renderer.hook.isPaused, false);
  assert.equal(renderer.starts.length, 1);
});

test('收藏夹检测占用期间阻止其他入口，停止后不弹出旧结果', async () => {
  const gate = createDeferred();
  const renderer = createRendererHarness(() => gate.promise);
  renderer.hook.setUrlInput('123');
  const running = renderer.hook.handleDetectFavlist();
  await renderer.run();
  assert.equal(renderer.lookups, 0);
  renderer.hook.handleStop();
  assert.equal(renderer.hook.isWorkflowBusy, true);
  gate.resolve([newVideo]);
  await running;
  assert.equal(renderer.hook.isWorkflowBusy, false);
  assert.equal(renderer.hook.isMissingVideosModalOpen, false);
});

test('停止能关闭重复下载确认并结算等待用户选择的准备阶段', async () => {
  const opened = createDeferred();
  const renderer = createRendererHarness([oldVideo], undefined, true, {
    onStateChange: value => { if (value?.videoTitle) opened.resolve(); }
  });
  const running = renderer.hook.checkAndAddTasks([oldVideo.bvid], false);
  // 等待真实 Hook 设置确认弹窗状态，不假定 Promise 的微任务层数。
  await opened.promise;
  assert.ok(renderer.hook.redownloadConfirm);
  await renderer.run();
  assert.equal(renderer.lookups, 0);
  renderer.hook.handleStop();
  await running;
  assert.equal(renderer.hook.redownloadConfirm, null);
  assert.equal(renderer.queue.length, 0);
  assert.equal(renderer.hook.isWorkflowBusy, false);
});

test('定时开关、启动、唤醒和轮询同时触发只发起一次默认收藏夹查询', async () => {
  const gate = createDeferred();
  const entered = createDeferred();
  const renderer = createRendererHarness([oldVideo], undefined, true, { lookup: () => { entered.resolve(); return gate.promise; } });
  const scheduler = createSchedulerHarness(message => {
    assert.equal(message, null);
    return renderer.scheduled();
  });
  scheduler.enable();
  scheduler.startup();
  scheduler.wake();
  scheduler.tick();
  await entered.promise;
  assert.equal(renderer.lookups, 1);
  assert.equal(renderer.scans, 0);
  gate.resolve(123);
  await scheduler.finish();
  assert.equal(renderer.scans, 1);
  assert.equal(renderer.removals.length, 1);
});

test('普通下载输入在第一次异步检查前占用流程，重复点击只扫描一次', async () => {
  const gate = createDeferred();
  const renderer = createRendererHarness(() => gate.promise);
  renderer.hook.setUrlInput(newVideo.bvid);
  const entry = renderer.hook.handleDownload;
  const running = entry();
  await entry();
  await renderer.run();
  assert.equal(renderer.scans, 1);
  assert.equal(renderer.lookups, 0);
  gate.resolve([newVideo]);
  await running;
  assert.equal(renderer.queue.length, 1);
});

test('转存收藏期间阻止其他入口，停止后等待当前转存而不处理下一条', async () => {
  const gate = createDeferred();
  const entered = createDeferred();
  let collects = 0;
  const renderer = createRendererHarness([newVideo, nextVideo], undefined, true, {
    collect: () => { collects++; entered.resolve(); return gate.promise; }
  });
  renderer.hook.setUrlInput('123');
  await renderer.hook.handleDetectFavlist();
  const running = renderer.hook.handleCollectAll();
  await entered.promise;
  await renderer.run();
  assert.equal(renderer.lookups, 1);
  renderer.hook.handleStop();
  assert.equal(renderer.hook.isWorkflowBusy, true);
  gate.resolve({ success: true });
  await running;
  assert.equal(collects, 1);
  assert.equal(renderer.hook.isWorkflowBusy, false);
});

test('旧流程遗留的队列 effect 不能在新流程占用后启动旧任务', async () => {
  const renderer = createRendererHarness([]);
  await renderer.hook.checkAndAddTasks([newVideo.bvid], true);
  const oldEffect = renderer.flush();
  renderer.hook.handleStop();
  renderer.complete(null);
  await renderer.hook.checkAndAddTasks([nextVideo.bvid], true);
  oldEffect();
  assert.equal(renderer.starts.length, 1);
  renderer.flush();
  assert.equal(renderer.starts.length, 2);
  assert.equal(renderer.starts[1][0], nextVideo.bvid);
});
