// 取消收藏回归测试：直接加载主进程和下载 Hook 源码，用内存模拟 IPC、网络和文件系统。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createMainHarness, createRendererHarness } = require('./helpers/downloadHarness.cjs');

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
