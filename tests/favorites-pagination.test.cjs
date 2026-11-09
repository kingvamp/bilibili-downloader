// 收藏夹分页回归：真实 downloader.ts 按接口终止标记保留末页，不把请求失败当成空列表。
// 关联：helpers/downloadHarness.cjs 隔离依赖；所有响应、历史和等待均在内存中模拟。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadSource } = require('./helpers/downloadHarness.cjs');

/** 生成字段完整且互不重复的视频条目，不依赖真实收藏夹或用户记录。 */
function media(id) {
  return { bvid: `BV${String(id).padStart(10, '0')}`, id, title: `视频 ${id}` };
}

/** 只允许预设分页查询；文件写入、子进程和收藏操作均直接拒绝。 */
function createPaginationHarness(pages, history = []) {
  const requests = [];
  const logs = [];
  let bbdownCalls = 0;
  const forbidden = () => assert.fail('分页查询不应触发文件写入、下载或收藏变更');
  const downloader = loadSource('src/main/downloader.ts', {
    electron: { app: { isPackaged: false }, clipboard: { writeText: forbidden } },
    path, fs: { promises: { writeFile: forbidden } },
    axios: { get: async rawUrl => {
      const url = new URL(rawUrl);
      assert.equal(url.hostname, 'api.bilibili.com');
      assert.ok(['/x/v3/fav/resource/list', '/x/v1/medialist/resource/list'].includes(url.pathname));
      const page = Number(url.searchParams.get('pn'));
      assert.equal(url.searchParams.get('ps'), '20');
      requests.push(page);
      const response = pages[page - 1];
      assert.ok(response, `不应请求第 ${page} 页`);
      if (response instanceof Error) throw response;
      return { data: response };
    } },
    execa: { execa: () => { bbdownCalls++; assert.fail('已识别收藏夹不应回退到 BBDown'); } },
    'fast-glob': forbidden,
    './state': { AppPaths: { historyPath: 'mock-history' } },
    './api': { removeFromFavFolder: forbidden },
    './settings': { getSettings: forbidden, getSetting: forbidden },
    './auth': { getCookie: () => 'mock-cookie' },
    './history': { readDownloadHistory: () => new Set(history) },
    './downloadProgress': { createDownloadProgressParser: forbidden }
  }, { Error, setTimeout: callback => { callback(); } });
  return {
    requests, logs,
    inspect: (url = '123') => downloader.inspectHistory(url, message => logs.push(message)),
    get bbdownCalls() { return bbdownCalls; }
  };
}

test('v3 的 20+19 条末页完整返回39条及19条未下载，不再请求第三页', async () => {
  const first = Array.from({ length: 20 }, (_, index) => media(index + 1));
  const last = Array.from({ length: 19 }, (_, index) => media(index + 21));
  const history = [...first.slice(0, 18), ...last.slice(0, 2)].map(item => item.bvid);
  const env = createPaginationHarness([
    { code: 0, data: { medias: first, has_more: true } },
    { code: 0, data: { medias: last, has_more: false } },
    { code: 0, data: { medias: null, has_more: false } }
  ], history);
  const results = await env.inspect();
  assert.equal(results.length, 39);
  assert.equal(results.filter(item => !item.isDownloaded).length, 19);
  assert.deepEqual(Array.from(results, item => item.bvid), [...first, ...last].map(item => item.bvid));
  assert.deepEqual(env.requests, [1, 2]);
  assert.equal(env.bbdownCalls, 0);
});

test('v3 正常空收藏夹 medias:null 且 has_more:false 返回空结果', async () => {
  const env = createPaginationHarness([{ code: 0, data: { medias: null, has_more: false } }]);
  assert.equal((await env.inspect()).length, 0);
  assert.deepEqual(env.requests, [1]);
  assert.equal(env.bbdownCalls, 0);
});

test('v3 缺少分页标记、继续页空数据或损坏条目仍报结构错误', async () => {
  for (const data of [
    { medias: [media(1)] },
    { medias: null, has_more: true },
    { medias: [], has_more: true },
    { medias: {}, has_more: true },
    { medias: [{ ...media(1), bvid: 'invalid' }], has_more: true }
  ]) {
    const env = createPaginationHarness([{ code: 0, data }]);
    await assert.rejects(env.inspect(), /格式(?:异常|错误)/);
    assert.deepEqual(env.requests, [1]);
    assert.equal(env.bbdownCalls, 0);
  }
});

test('v3 第二页业务或网络失败仍拒绝整个扫描，不返回第一页部分结果', async () => {
  const networkError = new Error('模拟第二页网络失败');
  for (const failure of [{ code: -412, message: '模拟第二页业务拒绝' }, networkError]) {
    const env = createPaginationHarness([
      { code: 0, data: { medias: [media(1)], has_more: true } }, failure
    ]);
    await assert.rejects(env.inspect(), error => failure === networkError
      ? error === networkError : error.message.includes('模拟第二页业务拒绝'));
    assert.deepEqual(env.requests, [1, 2]);
    assert.equal(env.bbdownCalls, 0);
  }
});

test('v3 未下载数量达到20条仍按既有阈值停止，不因 has_more:true 继续请求', async () => {
  const items = Array.from({ length: 20 }, (_, index) => media(index + 1));
  const env = createPaginationHarness([{ code: 0, data: { medias: items, has_more: true } }]);
  const results = await env.inspect();
  assert.equal(results.length, 20);
  assert.ok(results.every(item => !item.isDownloaded));
  assert.deepEqual(env.requests, [1]);
  assert.equal(env.bbdownCalls, 0);
});

test('medialist v1 保留既有数组终止规则，不套用 v3 的 has_more 标记', async () => {
  const item = media(1);
  const env = createPaginationHarness([
    { code: 0, data: { list: [{ bv_id: item.bvid, id: item.id, title: item.title }], has_more: false } },
    { code: 0, data: { list: [] } }
  ]);
  const results = await env.inspect('https://www.bilibili.com/list/ml123');
  assert.equal(results.length, 1);
  assert.equal(results[0].bvid, item.bvid);
  assert.deepEqual(env.requests, [1, 2]);
  assert.equal(env.bbdownCalls, 0);
});
