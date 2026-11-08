// 取消收藏回归：直接调用主进程下载器与控制器，用内存隔离网络和文件系统。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createMainHarness, createManagerHarness, settled } = require('./helpers/downloadHarness.cjs');

const oldVideo = { bvid: 'BV17x411w7KC', aid: 170001, title: '已下载视频', isDownloaded: true };
const newVideo = { bvid: 'BV1x2ynBmEC2', aid: 170002, title: '未下载视频', isDownloaded: false };

test('下载成功且业务成功时取消收藏，并写入历史后结算下载', async () => {
  const main = createMainHarness();
  await main.download();
  assert.equal(main.requests.length, 1);
  assert.equal(main.requests[0].get('rid'), '170001');
  assert.equal(main.requests[0].get('del_media_ids'), '123');
  assert.equal(main.requests[0].get('add_media_ids'), '');
  assert.equal(main.hasLog('已从收藏夹移除'), true);
  assert.ok(main.history.includes(oldVideo.bvid));
  assert.equal(main.result, 0);
});

test('HTTP 200 业务失败不报移除成功，记录错误码并继续下载队列', async () => {
  const main = createMainHarness({ businessCode: -101 });
  await main.download();
  assert.equal(main.hasLog('已从收藏夹移除'), false);
  assert.equal(main.hasLog('取消收藏失败'), true);
  assert.equal(main.hasLog('code: -101'), true);
  assert.ok(main.history.includes(oldVideo.bvid));
  assert.equal(main.result, 0);
});

test('取消收藏网络失败仍结算下载成功', async () => {
  const main = createMainHarness({ networkError: true });
  await main.download();
  assert.equal(main.hasLog('模拟网络断开'), true);
  assert.equal(main.hasLog('已从收藏夹移除'), false);
  assert.equal(main.result, 0);
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
    assert.equal(main.result, 0);
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

test('历史清理业务函数同样校验错误码', async () => {
  const main = createMainHarness({ businessCode: -111 });
  const result = await main.remove(170001, 123);
  assert.equal(result.success, false);
  assert.ok(result.message.includes('code: -111'));
});

test('新旧混合时只清理已下载条目，新视频携带收藏信息入队', async () => {
  const env = createManagerHarness([oldVideo, newVideo]);
  env.manager.startDefaultFavorites();
  await settled();
  assert.equal(env.removals.length, 1);
  assert.equal(env.removals[0].aid, oldVideo.aid);
  assert.equal(env.starts.length, 1);
  assert.equal(env.starts[0].url, newVideo.bvid);
  assert.equal(env.starts[0].aid, newVideo.aid);
  assert.equal(env.starts[0].mediaId, 123);
});

test('全部已下载时清理收藏且不建立下载任务', async () => {
  const env = createManagerHarness([oldVideo]);
  env.manager.startDefaultFavorites();
  await settled();
  assert.equal(env.removals.length, 1);
  assert.equal(env.starts.length, 0);
});

test('全部未下载时只入队，下载完成前不取消收藏', async () => {
  const env = createManagerHarness([newVideo]);
  env.manager.startDefaultFavorites();
  await settled();
  assert.equal(env.removals.length, 0);
  assert.equal(env.starts.length, 1);
});

test('关闭开关时扫描不清理历史条目', async () => {
  const env = createManagerHarness([oldVideo, newVideo], undefined, false);
  env.manager.startDefaultFavorites();
  await settled();
  assert.equal(env.removals.length, 0);
  assert.equal(env.starts.length, 1);
});

test('清理失败和缺少 AID 都有日志，仍继续新视频入队', async () => {
  const noAid = { ...oldVideo, bvid: 'BV17x411w7KD', aid: undefined };
  const env = createManagerHarness([oldVideo, noAid, newVideo], async () => ({ success: false, message: '模拟拒绝' }));
  env.manager.startDefaultFavorites();
  await settled();
  assert.equal(env.removals.length, 1);
  assert.ok(env.logs.includes('模拟拒绝'));
  assert.ok(env.logs.includes('未能获取到 AID'));
  assert.equal(env.starts.length, 1);
});

test('移除失败后的历史条目，在下一次混合扫描中再次处理', async () => {
  const options = { businessCode: -101 };
  const main = createMainHarness(options);
  await main.download();
  assert.equal(main.hasLog('已从收藏夹移除'), false);
  options.businessCode = 0;
  const env = createManagerHarness([
    { ...oldVideo, isDownloaded: main.history.includes(oldVideo.bvid) }, newVideo
  ], main.remove);
  env.manager.startDefaultFavorites();
  await settled();
  assert.equal(main.requests.length, 2);
  assert.equal(env.removals[0].aid, oldVideo.aid);
  assert.ok(env.logs.includes('已取消收藏'));
  assert.equal(env.starts[0].url, newVideo.bvid);
});
