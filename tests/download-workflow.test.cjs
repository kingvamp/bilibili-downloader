// 下载流程互斥回归：通过真实主进程控制器和 API 验证入口、队列、暂停、停止与串行请求。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createMainHarness, createManagerHarness, createDeferred, createSchedulerHarness, settled } = require('./helpers/downloadHarness.cjs');

const oldVideo = { bvid: 'BV17x411w7KC', aid: 170001, title: '已下载视频', isDownloaded: true };
const newVideo = { bvid: 'BV1x2ynBmEC2', aid: 170002, title: '新视频', isDownloaded: false };
const nextVideo = { ...newVideo, bvid: 'BV1x2ynBmEC3', aid: 170003 };

test('同一时刻重复手动触发只查询、扫描和取消收藏一次', async () => {
  const env = createManagerHarness([oldVideo]);
  assert.equal(env.manager.startDefaultFavorites(), true);
  assert.equal(env.manager.startDefaultFavorites(), false);
  await settled();
  assert.equal(env.lookups, 1);
  assert.equal(env.scans, 1);
  assert.equal(env.removals.length, 1);
  assert.equal(env.status.busy, false);
});

test('查询默认收藏夹期间阻止定时触发与静默剪贴板入队', async () => {
  const gate = createDeferred();
  const env = createManagerHarness([oldVideo], undefined, true, { lookup: () => gate.promise });
  env.manager.startDefaultFavorites();
  createSchedulerHarness(env.manager).enable();
  assert.equal(env.manager.startUrls([newVideo.bvid], true), false);
  assert.equal(env.lookups, 1);
  assert.equal(env.scans, 0);
  assert.equal(env.starts.length, 0);
  gate.resolve(123);
  await settled();
  assert.equal(env.scans, 1);
  assert.equal(env.removals.length, 1);
});

test('定时扫描占用期间阻止手动流程', async () => {
  const gate = createDeferred();
  const entered = createDeferred();
  const env = createManagerHarness(() => { entered.resolve(); return gate.promise; });
  createSchedulerHarness(env.manager).enable();
  await entered.promise;
  assert.equal(env.manager.startDefaultFavorites(), false);
  assert.equal(env.scans, 1);
  assert.equal(env.lookups, 1);
  gate.resolve([oldVideo]);
  await settled();
  assert.equal(env.removals.length, 1);
});

test('普通下载队列阻止默认收藏夹和新的普通下载入口', async () => {
  const env = createManagerHarness([]);
  env.manager.startUrls([newVideo.bvid], true);
  assert.equal(env.manager.startDefaultFavorites(), false);
  assert.equal(env.manager.startUrls([nextVideo.bvid], true), false);
  await settled();
  assert.equal(env.lookups, 0);
  assert.equal(env.starts.length, 1);
  assert.equal(env.status.busy, true);
  await env.complete();
  assert.equal(env.status.busy, false);
});

test('扫描结束后保留占用到整个队列完成，不启动第二个流程', async () => {
  const env = createManagerHarness([newVideo, nextVideo]);
  env.manager.startDefaultFavorites();
  await settled();
  assert.equal(env.manager.startDefaultFavorites(), false);
  assert.equal(env.lookups, 1);
  assert.equal(env.status.busy, true);
  assert.equal(env.starts.length, 1);
  await env.complete();
  assert.equal(env.starts.length, 2);
  assert.equal(env.status.busy, true);
  createSchedulerHarness(env.manager).enable();
  assert.equal(env.lookups, 1);
  await env.complete();
  assert.equal(env.status.busy, false);
  assert.equal(env.manager.startDefaultFavorites(), true);
  assert.equal(env.lookups, 2);
});

test('暂停保留占用，旧子进程结束前不能恢复或启动其他流程', async () => {
  const env = createManagerHarness([newVideo, nextVideo]);
  env.manager.startDefaultFavorites();
  await settled();
  env.manager.pause();
  env.manager.resume();
  assert.equal(env.manager.startDefaultFavorites(), false);
  assert.equal(env.stops, 1);
  assert.equal(env.starts.length, 1);
  assert.equal(env.lookups, 1);
  assert.equal(env.status.paused, true);
  await env.complete(null);
  assert.equal(env.status.busy, true);
  assert.equal(env.starts.length, 1);
  env.manager.resume();
  assert.equal(env.starts.length, 2);
  await env.complete();
  assert.equal(env.starts.length, 3);
  await env.complete();
  assert.equal(env.status.busy, false);
});

test('停止下载后等待在途任务完成，不启动剩余任务或新流程', async () => {
  const env = createManagerHarness([newVideo, nextVideo]);
  env.manager.startDefaultFavorites();
  await settled();
  env.manager.stop();
  assert.equal(env.manager.startDefaultFavorites(), false);
  assert.equal(env.status.busy, true);
  assert.equal(env.lookups, 1);
  await env.complete(null);
  assert.equal(env.starts.length, 1);
  assert.equal(env.status.busy, false);
  assert.equal(env.status.completed, 0);
  assert.equal(env.manager.startDefaultFavorites(), true);
  assert.equal(env.lookups, 2);
});

test('查询期间停止要等查询返回，且不继续扫描或入队', async () => {
  const gate = createDeferred();
  const entered = createDeferred();
  const env = createManagerHarness([newVideo], undefined, true, { lookup: () => { entered.resolve(); return gate.promise; } });
  env.manager.startDefaultFavorites();
  await entered.promise;
  env.manager.stop();
  assert.equal(env.manager.startDefaultFavorites(), false);
  assert.equal(env.status.busy, true);
  assert.equal(env.lookups, 1);
  gate.resolve(123);
  await settled();
  assert.equal(env.scans, 0);
  assert.equal(env.starts.length, 0);
  assert.equal(env.status.busy, false);
});

test('清理期间停止只等待当前取消收藏，不继续下一条或下载入队', async () => {
  const gate = createDeferred();
  const entered = createDeferred();
  const env = createManagerHarness([oldVideo, { ...oldVideo, aid: 170004 }, newVideo], () => {
    entered.resolve();
    return gate.promise;
  });
  env.manager.startDefaultFavorites();
  await entered.promise;
  env.manager.stop();
  createSchedulerHarness(env.manager).enable();
  assert.equal(env.status.busy, true);
  assert.equal(env.removals.length, 1);
  gate.resolve({ success: true });
  await settled();
  assert.equal(env.removals.length, 1);
  assert.equal(env.starts.length, 0);
  assert.equal(env.status.busy, false);
});

test('扫描抛错后释放执行权，后续流程仍可启动', async () => {
  let fail = true;
  const env = createManagerHarness(() => {
    if (fail) throw new Error('模拟扫描失败');
    return [];
  });
  env.manager.startDefaultFavorites();
  await settled();
  assert.ok(env.logs.includes('模拟扫描失败'));
  assert.equal(env.status.busy, false);
  fail = false;
  env.manager.startDefaultFavorites();
  await settled();
  assert.equal(env.lookups, 2);
  assert.equal(env.status.busy, false);
});

test('历史清理与下载完成的取消收藏共用主进程串行队列', async () => {
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
  assert.equal(main.result, 0);
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
  const env = createManagerHarness([newVideo, nextVideo]);
  env.manager.startDefaultFavorites();
  await settled();
  env.manager.pause();
  await env.complete(0);
  assert.equal(env.status.paused, true);
  assert.equal(env.status.busy, true);
  assert.equal(env.status.completed, 1);
  env.manager.resume();
  assert.equal(env.starts.length, 2);
  assert.equal(env.starts[1].url, nextVideo.bvid);
  await env.complete();
  assert.equal(env.status.busy, false);
});

test('暂停恰逢最后一个任务成功时释放流程并清除暂停状态', async () => {
  const env = createManagerHarness([newVideo]);
  env.manager.startDefaultFavorites();
  await settled();
  env.manager.pause();
  await env.complete(0);
  assert.equal(env.status.busy, false);
  assert.equal(env.status.paused, false);
  assert.equal(env.starts.length, 1);
});

test('收藏夹检测占用期间阻止其他入口，停止后不公布旧结果', async () => {
  const gate = createDeferred();
  const env = createManagerHarness(() => gate.promise);
  const running = env.manager.detect('123');
  assert.equal(env.manager.startDefaultFavorites(), false);
  assert.equal(env.lookups, 0);
  env.manager.stop();
  assert.equal(env.status.busy, true);
  gate.resolve([newVideo]);
  assert.equal(await running, null);
  assert.equal(env.status.busy, false);
});

test('停止能关闭重复下载确认并结算等待用户选择的准备阶段', async () => {
  const opened = createDeferred();
  const env = createManagerHarness([oldVideo], undefined, true, { onConfirmation: () => opened.resolve() });
  env.manager.startUrls([oldVideo.bvid], false);
  await opened.promise;
  assert.ok(env.confirmation);
  assert.equal(env.manager.startDefaultFavorites(), false);
  assert.equal(env.lookups, 0);
  env.manager.stop();
  await settled();
  assert.equal(env.confirmation, null);
  assert.equal(env.starts.length, 0);
  assert.equal(env.status.busy, false);
});

test('定时开关、启动、唤醒和轮询同时触发只发起一次默认收藏夹查询', async () => {
  const gate = createDeferred();
  const entered = createDeferred();
  const env = createManagerHarness([oldVideo], undefined, true, { lookup: () => { entered.resolve(); return gate.promise; } });
  const scheduler = createSchedulerHarness(env.manager);
  scheduler.enable();
  scheduler.startup();
  scheduler.wake();
  scheduler.tick();
  await entered.promise;
  assert.equal(env.lookups, 1);
  assert.equal(env.scans, 0);
  gate.resolve(123);
  await settled();
  assert.equal(env.scans, 1);
  assert.equal(env.removals.length, 1);
});

test('普通下载在第一次异步检查前占用流程，重复触发只扫描一次', async () => {
  const gate = createDeferred();
  const env = createManagerHarness(() => gate.promise);
  assert.equal(env.manager.startUrls([newVideo.bvid], false), true);
  assert.equal(env.manager.startUrls([newVideo.bvid], false), false);
  assert.equal(env.manager.startDefaultFavorites(), false);
  assert.equal(env.scans, 1);
  assert.equal(env.lookups, 0);
  gate.resolve([newVideo]);
  await settled();
  assert.equal(env.starts.length, 1);
});

test('转存收藏期间阻止其他入口，停止后等待当前转存而不处理下一条', async () => {
  const gate = createDeferred();
  const entered = createDeferred();
  let collects = 0;
  const env = createManagerHarness([newVideo, nextVideo], undefined, true, {
    collect: () => { collects++; entered.resolve(); return gate.promise; }
  });
  const items = await env.manager.detect('123');
  env.manager.startCollect(items);
  await entered.promise;
  assert.equal(env.manager.startDefaultFavorites(), false);
  assert.equal(env.lookups, 1);
  env.manager.stop();
  assert.equal(env.status.busy, true);
  gate.resolve({ success: true });
  await settled();
  assert.equal(collects, 1);
  assert.equal(env.status.busy, false);
});
