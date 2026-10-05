// 打包冒烟启动器：运行指定 Electron，等待退出后清理本次测试的独立目录。
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const electronPath = process.argv[2];
if (!electronPath) throw new Error('必须提供 Electron 可执行文件路径');
const packagedRoot = path.resolve(process.argv[3] ?? path.join(__dirname, '../release/win-unpacked'));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'bili-packaged-'));
const testEnv = { ...process.env };
delete testEnv.ELECTRON_RUN_AS_NODE;
const child = spawn(electronPath, [path.join(__dirname, 'smoke-packaged.cjs'), packagedRoot, scratch], {
  stdio: 'inherit', windowsHide: true,
  env: testEnv
});

/** 仅删除本次创建且位于系统临时目录内的测试目录。 */
function cleanup() {
  if (path.dirname(scratch) !== os.tmpdir() || !path.basename(scratch).startsWith('bili-packaged-')) {
    throw new Error('拒绝清理范围之外的临时目录');
  }
  fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
child.on('error', error => { console.error(error); cleanup(); process.exitCode = 1; });
child.on('close', code => { cleanup(); process.exitCode = code ?? 1; });
