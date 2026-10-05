// 设置 Hook 回归：覆盖加载、确认前等待、落盘失败和重复保存的真实异步边界。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSource, createDeferred } = require('./helpers/downloadHarness.cjs');

// 使用确定性的 Hook 槽位，所有设置读写通过可控 Promise 执行。
function createHookHarness(api) {
  const shared = loadSource('src/shared/settings.ts', {});
  const states = [];
  const refs = [];
  const effects = [];
  const alerts = [];
  let stateIndex = 0;
  let refIndex = 0;
  const { useSettings } = loadSource('src/renderer/hooks/useSettings.ts', {
    '../../shared/settings': shared,
    react: {
      useState: initial => {
        const index = stateIndex++;
        if (!(index in states)) states[index] = initial;
        return [states[index], value => { states[index] = value; }];
      },
      useRef: initial => refs[refIndex] ?? (refs[refIndex++] = { current: initial }),
      useEffect: callback => { if (!effects.length) effects.push(callback); }
    }
  }, { window: { api }, alert: text => alerts.push(text), console: { error: () => {} } });
  // 重新读取同一组状态与 ref，避免把渲染延迟当作同步确认。
  const render = () => { stateIndex = 0; refIndex = 0; return useSettings(() => {}); };
  render();
  effects[0]();
  return { render, alerts, defaults: shared.DEFAULT_SETTINGS };
}

test('首次读取未完成不能保存，加载失败保持不可编辑并明确提示', async () => {
  const loading = createDeferred();
  let writes = 0;
  const harness = createHookHarness({ getSettings: () => loading.promise, saveSettings: () => { writes++; } });
  assert.equal(await harness.render().saveSettings(harness.defaults), false);
  assert.equal(writes, 0);
  loading.reject(new Error('模拟 IPC 读取失败'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(harness.render().isReady, false);
  assert.match(harness.alerts[0], /IPC 读取失败/);
});

test('保存确认前保留原值，同步重复保存只提交一次，确认后应用权威值', async () => {
  const saving = createDeferred();
  let writes = 0;
  const harness = createHookHarness({ getSettings: async () => ({ downloadDir: 'original' }),
    saveSettings: () => { writes++; return saving.promise; } });
  await new Promise(resolve => setImmediate(resolve));
  const hook = harness.render();
  const pending = hook.saveSettings({ downloadDir: 'requested' });
  assert.equal(await hook.saveSettings({ downloadDir: 'duplicate' }), false);
  assert.equal(writes, 1);
  assert.equal(harness.render().settings.downloadDir, 'original');
  assert.equal(harness.render().isSaving, true);
  saving.resolve({ success: true, settings: { downloadDir: 'confirmed' } });
  assert.equal(await pending, true);
  assert.equal(harness.render().settings.downloadDir, 'confirmed');
  assert.equal(harness.render().isSaving, false);
});

test('保存失败不更改界面设置、不确认关闭，明确提示且释放保存状态', async () => {
  const harness = createHookHarness({ getSettings: async () => ({ downloadDir: 'original' }),
    saveSettings: async () => ({ success: false, message: '模拟磁盘写入失败' }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await harness.render().saveSettings({ downloadDir: 'new' }), false);
  assert.equal(harness.render().settings.downloadDir, 'original');
  assert.equal(harness.render().isSaving, false);
  assert.match(harness.alerts[0], /磁盘写入失败/);
});
