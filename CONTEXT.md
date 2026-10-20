# 当前工作上下文

- 当前正在做什么：优化 Bilibili Downloader 的后台常驻可靠性和内存开销，保留每小时一次自动扫描的规则。
- 上次停在什么位置：已在 `refactor/main-process-download-manager` 分支中接入主进程统一下载控制器、窗口关闭到托盘后释放渲染窗口、恢复 IPC 状态与剪贴板/设置意图。尚未完成 Windows 真机、完整构建和新增主进程/窗口测试的执行验收，未合并 `main`。
- 本次修改提交说明：`refactor: move download workflow ownership to Electron main process; release renderer when closing to tray; cover workflow concurrency with tests`。
