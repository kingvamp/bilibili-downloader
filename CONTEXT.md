# 当前工作上下文

- 当前正在做什么：优化 Bilibili Downloader 的后台常驻可靠性和内存开销，保留每小时一次自动扫描的规则。
- 上次停在什么位置：已在 `refactor/main-process-download-manager` 分支中接入主进程统一下载控制器、窗口关闭到托盘后释放渲染窗口、恢复 IPC 状态与剪贴板/设置意图。PR #2 已按要求合并至 `main`（合并提交 `d83afceed02115f0259752dee40d791a7c52916d`）。尚未执行 Windows 真机、完整构建以及新增主进程/窗口测试的验收。
- 本次修改的提交说明：`merge: PR #2 main-process download workflow`；后台重构与相关回归测试已进入 `main`，下一步执行 `npm test`、`npm run build` 及真实下载验收。
